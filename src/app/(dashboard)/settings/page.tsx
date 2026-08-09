import type { Metadata } from "next";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ManageBillingButton,
  UpgradeButton,
} from "@/features/billing/components/billing-actions";
import { UsageMeter } from "@/features/billing/components/usage-meter";
import { PageHeader } from "@/features/dashboard/components/page-header";
import { getGenerationStats } from "@/features/text-to-speech/data/queries";
import { requireAuthContext } from "@/lib/auth/context";
import { getBillingProvider } from "@/lib/billing";
import { getSpeechGenerator } from "@/lib/chatterbox";
import { getStorage } from "@/lib/storage";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const { organizationId } = await requireAuthContext();
  const params = await searchParams;

  const billing = getBillingProvider();
  const speechGenerator = getSpeechGenerator();
  const storage = getStorage();

  const entitlement = await billing.getOrganizationEntitlement(organizationId);
  const stats = await getGenerationStats(organizationId, entitlement.periodStart);

  const checkoutState =
    typeof params.checkout === "string" ? params.checkout : null;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Plan, usage and workspace configuration"
      />

      <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
        {checkoutState === "success" ? (
          <Alert>
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>Subscription active</AlertTitle>
            <AlertDescription>
              Thanks — your workspace is upgraded. It may take a moment for the
              plan below to refresh.
            </AlertDescription>
          </Alert>
        ) : null}

        {checkoutState === "unavailable" ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Checkout is not configured</AlertTitle>
            <AlertDescription>
              This deployment has no Polar credentials, so payments cannot be
              taken. Set <code>POLAR_ACCESS_TOKEN</code> and{" "}
              <code>POLAR_PRODUCT_ID</code> to enable checkout.
            </AlertDescription>
          </Alert>
        ) : null}

        {entitlement.degraded ? (
          <Alert>
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Plan details are temporarily unavailable</AlertTitle>
            <AlertDescription>
              We could not reach the billing provider, so the free allowance is
              shown. Usage below is accurate.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Plan
              <Badge variant="secondary" className="font-normal">
                {entitlement.planName}
              </Badge>
            </CardTitle>
            <CardDescription>
              Billing period{" "}
              {entitlement.periodStart.toLocaleDateString()} –{" "}
              {entitlement.periodEnd.toLocaleDateString()}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <UsageMeter
              label="Characters generated"
              used={entitlement.usedCharacters}
              included={entitlement.includedCharacters}
              unit="characters"
            />
            <UsageMeter
              label="Voice creations"
              used={entitlement.usedVoices}
              included={entitlement.includedVoices}
              unit="voices"
            />
          </CardContent>

          <CardFooter className="gap-2">
            <UpgradeButton
              label={entitlement.tier === "free" ? "Upgrade" : "Change plan"}
            />
            <ManageBillingButton />
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Workspace activity</CardTitle>
            <CardDescription>
              Totals for this workspace, all time unless noted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Generations" value={stats.total} />
              <Stat label="Completed" value={stats.completed} />
              <Stat label="Failed" value={stats.failed} />
              <Stat
                label="Characters this period"
                value={stats.charactersThisPeriod}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Integrations</CardTitle>
            <CardDescription>
              Which adapters this deployment is currently running.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <IntegrationRow
              name="Speech engine"
              value={
                speechGenerator.kind === "chatterbox"
                  ? "Chatterbox (self-hosted GPU)"
                  : "Development preview (no GPU service configured)"
              }
              healthy={speechGenerator.kind === "chatterbox"}
            />
            <IntegrationRow
              name="Object storage"
              value={
                storage.kind === "r2"
                  ? "S3-compatible bucket (Cloudflare R2)"
                  : "Local filesystem (development)"
              }
              healthy={storage.kind === "r2"}
            />
            <IntegrationRow
              name="Billing"
              value={
                billing.kind === "polar"
                  ? "Polar"
                  : "Development provider (free limits enforced, no payments)"
              }
              healthy={billing.kind === "polar"}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs text-pretty">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function IntegrationRow({
  name,
  value,
  healthy,
}: {
  name: string;
  value: string;
  healthy: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="font-medium">{name}</span>
      <span className="flex items-center gap-2 text-right">
        <span className="text-muted-foreground text-pretty">{value}</span>
        {healthy ? (
          <CheckCircle2
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-500"
            aria-label="Configured"
          />
        ) : (
          <Info
            className="text-muted-foreground size-4 shrink-0"
            aria-label="Development adapter"
          />
        )}
      </span>
    </div>
  );
}
