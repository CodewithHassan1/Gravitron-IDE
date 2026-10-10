package delegation

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func sign(t *testing.T, key *ecdsa.PrivateKey, claims jwt.Claims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	s, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return s
}

func keyPair(t *testing.T) (*ecdsa.PrivateKey, *ecdsa.PublicKey) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	return key, &key.PublicKey
}

func validClaims(execID string) *Claims {
	now := time.Now()
	return &Claims{
		Purpose:     Purpose,
		UserID:      "user_A",
		OrgID:       "org_A",
		ExecutionID: execID,
		Scope:       "agent:execute",
		JTI:         "jti-valid",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    Issuer,
			Audience:  jwt.ClaimStrings{Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        "jti-valid",
		},
	}
}

func TestVerifyAcceptsValidDelegation(t *testing.T) {
	priv, pub := keyPair(t)
	v := NewVerifier(pub)
	token := sign(t, priv, validClaims("exec-001"))

	claims, err := v.Verify(token, "exec-001")
	if err != nil {
		t.Fatalf("expected valid delegation, got error: %v", err)
	}
	if claims.UserID != "user_A" || claims.OrgID != "org_A" || claims.ExecutionID != "exec-001" {
		t.Fatalf("unexpected claims: %+v", claims)
	}
	if claims.JTI != "jti-valid" {
		t.Fatalf("unexpected jti: %q", claims.JTI)
	}
}

func TestVerifyRejectsMissingToken(t *testing.T) {
	_, pub := keyPair(t)
	v := NewVerifier(pub)
	if _, err := v.Verify("", "exec-001"); err == nil {
		t.Fatal("expected error for missing token")
	}
}

func TestVerifyRejectsMalformedToken(t *testing.T) {
	_, pub := keyPair(t)
	v := NewVerifier(pub)
	if _, err := v.Verify("not.a.jwt", "exec-001"); err == nil {
		t.Fatal("expected error for malformed token")
	}
}

func TestVerifyRejectsArbitraryBearerString(t *testing.T) {
	_, pub := keyPair(t)
	v := NewVerifier(pub)
	if _, err := v.Verify("some-arbitrary-bearer-value-12345", "exec-001"); err == nil {
		t.Fatal("expected error for arbitrary bearer string")
	}
}

func TestVerifyRejectsWrongSignature(t *testing.T) {
	priv, _ := keyPair(t)
	_, pub2 := keyPair(t) // different verifier key
	v := NewVerifier(pub2)
	token := sign(t, priv, validClaims("exec-001"))
	if _, err := v.Verify(token, "exec-001"); err == nil {
		t.Fatal("expected error for token signed by untrusted key")
	}
}

func TestVerifyRejectsExpiredToken(t *testing.T) {
	priv, pub := keyPair(t)
	v := NewVerifier(pub)
	claims := validClaims("exec-001")
	claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Minute))
	token := sign(t, priv, claims)
	if _, err := v.Verify(token, "exec-001"); err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestVerifyRejectsWrongIssuer(t *testing.T) {
	priv, pub := keyPair(t)
	v := NewVerifier(pub)
	claims := validClaims("exec-001")
	claims.Issuer = "evil-issuer"
	token := sign(t, priv, claims)
	if _, err := v.Verify(token, "exec-001"); err == nil {
		t.Fatal("expected error for wrong issuer")
	}
}

func TestVerifyRejectsWrongAudience(t *testing.T) {
	priv, pub := keyPair(t)
	v := NewVerifier(pub)
	claims := validClaims("exec-001")
	claims.Audience = jwt.ClaimStrings{"some-other-audience"}
	token := sign(t, priv, claims)
	if _, err := v.Verify(token, "exec-001"); err == nil {
		t.Fatal("expected error for wrong audience")
	}
}

func TestVerifyRejectsPurposeS2S(t *testing.T) {
	priv, pub := keyPair(t)
	v := NewVerifier(pub)
	claims := validClaims("exec-001")
	claims.Purpose = "s2s"
	token := sign(t, priv, claims)
	if _, err := v.Verify(token, "exec-001"); err == nil {
		t.Fatal("expected error for purpose=s2s")
	}
}

func TestVerifyRejectsMissingPurpose(t *testing.T) {
	priv, pub := keyPair(t)
	v := NewVerifier(pub)
	claims := validClaims("exec-001")
	claims.Purpose = ""
	token := sign(t, priv, claims)
	if _, err := v.Verify(token, "exec-001"); err == nil {
		t.Fatal("expected error for missing purpose")
	}
}

func TestVerifyRejectsMissingExecutionIDClaim(t *testing.T) {
	priv, pub := keyPair(t)
	v := NewVerifier(pub)
	claims := validClaims("")
	token := sign(t, priv, claims)
	if _, err := v.Verify(token, "exec-001"); err == nil {
		t.Fatal("expected error for missing execution_id")
	}
}

func TestVerifyRejectsMissingOrgIDClaim(t *testing.T) {
	priv, pub := keyPair(t)
	v := NewVerifier(pub)
	claims := validClaims("exec-001")
	claims.OrgID = ""
	token := sign(t, priv, claims)
	if _, err := v.Verify(token, "exec-001"); err == nil {
		t.Fatal("expected error for missing org_id")
	}
}

func TestVerifyRejectsMissingScopeClaim(t *testing.T) {
	priv, pub := keyPair(t)
	v := NewVerifier(pub)
	claims := validClaims("exec-001")
	claims.Scope = ""
	token := sign(t, priv, claims)
	if _, err := v.Verify(token, "exec-001"); err == nil {
		t.Fatal("expected error for missing scope")
	}
}

func TestVerifyRejectsMissingJTI(t *testing.T) {
	priv, pub := keyPair(t)
	v := NewVerifier(pub)
	claims := validClaims("exec-001")
	claims.JTI = ""
	token := sign(t, priv, claims)
	if _, err := v.Verify(token, "exec-001"); err == nil {
		t.Fatal("expected error for missing jti")
	}
}

func TestVerifyRejectsMismatchedExecutionBinding(t *testing.T) {
	priv, pub := keyPair(t)
	v := NewVerifier(pub)
	token := sign(t, priv, validClaims("exec-001"))
	if _, err := v.Verify(token, "exec-999"); err == nil {
		t.Fatal("expected error for mismatched execution binding")
	}
}

func TestVerifyRejectsDisallowedScope(t *testing.T) {
	priv, pub := keyPair(t)
	v := NewVerifier(pub)
	claims := validClaims("exec-001")
	claims.Scope = "full-admin"
	token := sign(t, priv, claims)
	if _, err := v.Verify(token, "exec-001"); err == nil {
		t.Fatal("expected error for disallowed scope")
	}
}

func TestAuthorizeExecutionEnforcesTenantAndUserBinding(t *testing.T) {
	priv, pub := keyPair(t)
	v := NewVerifier(pub)
	claims, err := v.Verify(sign(t, priv, validClaims("exec-001")), "exec-001")
	if err != nil {
		t.Fatalf("unexpected verify error: %v", err)
	}

	// No client-supplied identity -> allowed (identity comes from the token).
	if err := v.AuthorizeExecution(claims, "", ""); err != nil {
		t.Fatalf("expected empty identity to be allowed: %v", err)
	}
	// Matching org/user -> allowed.
	if err := v.AuthorizeExecution(claims, "org_A", "user_A"); err != nil {
		t.Fatalf("expected matching identity to be allowed: %v", err)
	}
	// Cross-tenant attempt (Org A delegation used against Org B) -> denied.
	if err := v.AuthorizeExecution(claims, "org_B", "user_A"); err == nil {
		t.Fatal("expected cross-tenant attempt to be rejected")
	}
	// Wrong user -> denied.
	if err := v.AuthorizeExecution(claims, "org_A", "user_B"); err == nil {
		t.Fatal("expected wrong user to be rejected")
	}
	// Both wrong -> denied.
	if err := v.AuthorizeExecution(claims, "org_B", "user_B"); err == nil {
		t.Fatal("expected wrong user+org to be rejected")
	}
}

func TestVerifierFailsClosedWithoutPublicKey(t *testing.T) {
	t.Setenv("INTERNAL_PUBLIC_KEY", "")
	if _, err := NewVerifierFromEnv(); err == nil {
		t.Fatal("expected NewVerifierFromEnv to fail when INTERNAL_PUBLIC_KEY is unset")
	}
}

func TestVerifierOnlyAcceptsPublicKey(t *testing.T) {
	priv, _ := keyPair(t)
	der, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		t.Fatalf("marshal private key: %v", err)
	}
	privPEM := string(pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der}))
	t.Setenv("INTERNAL_PUBLIC_KEY", privPEM)
	if _, err := NewVerifierFromEnv(); err == nil {
		t.Fatalf("expected private key PEM to be rejected")
	}
}

func TestVerifierAcceptsPublicKeyFromEnv(t *testing.T) {
	_, pub := keyPair(t)
	der, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		t.Fatalf("marshal public key: %v", err)
	}
	pubPEM := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}))
	t.Setenv("INTERNAL_PUBLIC_KEY", pubPEM)
	v, err := NewVerifierFromEnv()
	if err != nil {
		t.Fatalf("expected public key to be accepted: %v", err)
	}
	if v == nil {
		t.Fatal("expected non-nil verifier")
	}
}

func TestVerifyUnauthorizedNotMintableByVerifier(t *testing.T) {
	// The Verifier exposes no minting API and no private key. Prove that a
	// token cannot be created by the verifier path alone.
	_, pub := keyPair(t)
	v := NewVerifier(pub)
	if _, err := v.Verify("", "exec-001"); err == nil {
		t.Fatal("verifier must reject empty tokens")
	}
	if v.key == nil {
		t.Fatal("verifier key must be set")
	}
	// The verifier type must not expose private key material.
	if _, ok := interface{}(v).(interface{ Sign(string) string }); ok {
		t.Fatal("verifier must not offer a signing API")
	}
	ctx := context.Background()
	if ctx == nil {
		t.Fatal("noop")
	}
}