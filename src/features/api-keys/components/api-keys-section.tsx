import { KeyRound } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateApiKeyDialog } from "@/features/api-keys/components/create-api-key-dialog";
import { RevokeApiKeyButton } from "@/features/api-keys/components/revoke-api-key-button";
import { listApiKeys } from "@/features/api-keys/data/queries";

/**
 * Server component for the Settings page. Admins can create and revoke;
 * members see the list read-only — knowing which integrations exist is useful
 * to everyone, minting workspace-wide credentials is not.
 */
export async function ApiKeysSection({
  organizationId,
  isAdmin,
}: {
  organizationId: string;
  isAdmin: boolean;
}) {
  const keys = await listApiKeys(organizationId);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-sm">API keys</CardTitle>
          <CardDescription>
            Authenticate requests to <code>/api/v1</code> on behalf of this
            workspace. Keys are shown once at creation and stored hashed.
          </CardDescription>
        </div>
        {isAdmin ? <CreateApiKeyDialog /> : null}
      </CardHeader>

      <CardContent>
        {keys.length === 0 ? (
          <div className="text-muted-foreground flex items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-sm">
            <KeyRound className="size-4 shrink-0" aria-hidden="true" />
            {isAdmin
              ? "No API keys yet. Create one to call the REST API from your own systems."
              : "No API keys yet. Ask a workspace admin to create one."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                {isAdmin ? <TableHead className="w-10" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell className="font-mono text-xs">{key.maskedKey}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(key.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {key.lastUsedAt
                      ? new Date(key.lastUsedAt).toLocaleString()
                      : "Never"}
                  </TableCell>
                  {isAdmin ? (
                    <TableCell>
                      <RevokeApiKeyButton keyId={key.id} keyName={key.name} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
