// Package delegation verifies execution-bound agent delegation tokens at the
// Execution-Service security boundary.
//
// This package is verification-only. It never holds, reads, or accepts a
// signing private key: it parses the public verification key from
// INTERNAL_PUBLIC_KEY and validates ES256 signatures and claims.
package delegation

import (
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	// Issuer is the single trusted internal issuer (matching
	// packages/auth/src/s2s.ts TRUSTED_INTERNAL_ISSUER).
	Issuer = "ag-internal-gateway"
	// Audience is the agent execution-boundary audience. Delegation tokens
	// minted for agent execution are aud = "worker-ai".
	Audience = "worker-ai"
	// Purpose is the agent_delegation purpose claim.
	Purpose = "agent_delegation"
)

// AllowedScopes mirrors packages/auth/src/rbac.ts permission "agent:execute"
// and packages/auth/src/s2s.ts AGENT_EXECUTE_SCOPE.
var AllowedScopes = []string{"agent:execute"}

// ErrInvalidDelegation is returned for any failed verification.
var ErrInvalidDelegation = errors.New("invalid agent delegation")

// Claims is the required claim set for an agent delegation token.
type Claims struct {
	Purpose     string `json:"purpose"`
	UserID      string `json:"user_id"`
	OrgID       string `json:"org_id"`
	ExecutionID string `json:"execution_id"`
	Scope       string `json:"scope"`
	JTI         string `json:"jti"`
	jwt.RegisteredClaims
}

// Verifier cryptographically verifies delegation tokens using a public key only.
type Verifier struct {
	key      *ecdsa.PublicKey
	issuer   string
	audience string
}

// NewVerifierFromEnv constructs a Verifier from the INTERNAL_PUBLIC_KEY
// environment variable (SPKI PEM, ES256). It fails closed if the key is absent.
func NewVerifierFromEnv() (*Verifier, error) {
	pemStr := os.Getenv("INTERNAL_PUBLIC_KEY")
	if pemStr == "" {
		return nil, fmt.Errorf("%w: INTERNAL_PUBLIC_KEY is not set", ErrInvalidDelegation)
	}
	key, err := parseSPKI(pemStr)
	if err != nil {
		return nil, err
	}
	return &Verifier{key: key, issuer: Issuer, audience: Audience}, nil
}

// NewVerifier allows tests to construct a verifier with a specific key.
func NewVerifier(key *ecdsa.PublicKey) *Verifier {
	return &Verifier{key: key, issuer: Issuer, audience: Audience}
}

func parseSPKI(pemData string) (*ecdsa.PublicKey, error) {
	block, _ := pem.Decode([]byte(pemData))
	if block == nil {
		return nil, fmt.Errorf("%w: failed to decode INTERNAL_PUBLIC_KEY PEM", ErrInvalidDelegation)
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("%w: failed to parse public key: %v", ErrInvalidDelegation, err)
	}
	ecKey, ok := pub.(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("%w: INTERNAL_PUBLIC_KEY is not an ECDSA public key", ErrInvalidDelegation)
	}
	return ecKey, nil
}

// Verify cryptographically validates the token and enforces:
//
//	signature (ES256, against the public key)
//	issuer, audience, expiration
//	purpose == agent_delegation
//	presence of user_id / org_id / execution_id / scope / jti
//	execution_id == expectedExecutionID (execution binding)
//
// expectedExecutionID must be the trusted execution identity for the request.
func (v *Verifier) Verify(token string, expectedExecutionID string) (*Claims, error) {
	if token == "" {
		return nil, fmt.Errorf("%w: missing token", ErrInvalidDelegation)
	}
	if expectedExecutionID == "" {
		return nil, fmt.Errorf("%w: expected execution id is required", ErrInvalidDelegation)
	}

	claims := &Claims{}
	_, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (interface{}, error) {
		if t.Method.Alg() != "ES256" {
			return nil, fmt.Errorf("unexpected signing method %q", t.Method.Alg())
		}
		return v.key, nil
	},
		jwt.WithValidMethods([]string{"ES256"}),
		jwt.WithIssuer(v.issuer),
		jwt.WithAudience(v.audience),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
	)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidDelegation, err)
	}

	if claims.Purpose != Purpose {
		return nil, fmt.Errorf("%w: purpose is %q, expected %q", ErrInvalidDelegation, claims.Purpose, Purpose)
	}
	if strings.TrimSpace(claims.UserID) == "" {
		return nil, fmt.Errorf("%w: missing user_id claim", ErrInvalidDelegation)
	}
	if strings.TrimSpace(claims.OrgID) == "" {
		return nil, fmt.Errorf("%w: missing org_id claim", ErrInvalidDelegation)
	}
	if strings.TrimSpace(claims.ExecutionID) == "" {
		return nil, fmt.Errorf("%w: missing execution_id claim", ErrInvalidDelegation)
	}
	if strings.TrimSpace(claims.Scope) == "" {
		return nil, fmt.Errorf("%w: missing scope claim", ErrInvalidDelegation)
	}
	if strings.TrimSpace(claims.JTI) == "" {
		return nil, fmt.Errorf("%w: missing jti claim", ErrInvalidDelegation)
	}
	if !contains(AllowedScopes, claims.Scope) {
		return nil, fmt.Errorf("%w: scope %q is not permitted", ErrInvalidDelegation, claims.Scope)
	}
	if claims.ExecutionID != expectedExecutionID {
		return nil, fmt.Errorf("%w: execution binding mismatch", ErrInvalidDelegation)
	}
	if !claims.ExpiresAt.After(time.Now()) {
		return nil, fmt.Errorf("%w: token expired", ErrInvalidDelegation)
	}

	return claims, nil
}

// AuthorizeExecution enforces tenant/user binding between a verified
// delegation and the request context. Client-supplied identity is never
// authoritative; it must match the verified token claims.
func (v *Verifier) AuthorizeExecution(claims *Claims, bodyOrgID, bodyUserID string) error {
	if bodyOrgID != "" && bodyOrgID != claims.OrgID {
		return fmt.Errorf("%w: organization mismatch (delegation org %q)", ErrInvalidDelegation, claims.OrgID)
	}
	if bodyUserID != "" && bodyUserID != claims.UserID {
		return fmt.Errorf("%w: user mismatch (delegation user %q)", ErrInvalidDelegation, claims.UserID)
	}
	return nil
}

func contains(slice []string, value string) bool {
	for _, s := range slice {
		if s == value {
			return true
		}
	}
	return false
}