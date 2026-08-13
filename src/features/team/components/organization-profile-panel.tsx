"use client";

import { OrganizationProfile } from "@clerk/nextjs";

/**
 * Clerk's organization management embed: invitations (with the emails Clerk
 * sends), role changes, member removal, leave/delete workspace — all enforced
 * by Clerk's own permission model, so an org:member sees a read-only view of
 * what an org:admin can edit.
 *
 * Deliberately not rebuilt as custom UI: invitation lifecycles and permission
 * edge cases are exactly the kind of surface where a hand-rolled clone drifts
 * from the source of truth. Hash routing keeps the embed's internal tabs off
 * our route table.
 */
export function OrganizationProfilePanel() {
  return (
    <OrganizationProfile
      routing="hash"
      appearance={{
        elements: {
          rootBox: "w-full",
          cardBox: "w-full max-w-none shadow-none border rounded-xl",
        },
      }}
    />
  );
}
