'use client';

import React, { useEffect } from 'react';
import { useOrganizationStore } from '../stores/organization';

export function OrganizationSwitcher() {
  const { organizations, activeOrganizationId, fetchOrganizations, setActiveOrganization, isLoading } = useOrganizationStore();

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading organizations...</div>;
  }

  if (organizations.length === 0) {
    return <div className="text-sm text-gray-500">No organizations found</div>;
  }

  return (
    <div className="flex items-center space-x-2 p-2">
      <label htmlFor="org-switcher" className="text-sm font-medium text-gray-700">Team:</label>
      <select
        id="org-switcher"
        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
        value={activeOrganizationId || ''}
        onChange={(e) => setActiveOrganization(e.target.value)}
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
    </div>
  );
}
