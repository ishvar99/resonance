import type { Metadata } from "next";
import { KeyRound, UserX } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { PageHeader } from "@/features/dashboard/components/page-header";
import { OrganizationProfilePanel } from "@/features/team/components/organization-profile-panel";
import { getTeamActivity } from "@/features/team/data/queries";
import { roleLabel, type TeamActivityRow } from "@/features/team/merge";
import { requireAuthContext } from "@/lib/auth/context";

export const metadata: Metadata = {
  title: "Team",
};

export default async function TeamPage() {
  const { organizationId } = await requireAuthContext();
  const rows = await getTeamActivity(organizationId);

  return (
    <>
      <PageHeader
        title="Team"
        description="Who is in this workspace and what they have generated"
      />

      <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Activity by member</CardTitle>
            <CardDescription>
              Generation usage per person, all time. API-key traffic is listed
              separately — keys belong to the workspace, not to a person.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Generations</TableHead>
                  <TableHead className="text-right">Characters</TableHead>
                  <TableHead className="text-right">Last active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <ActivityRow key={row.key} row={row} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <section aria-label="Invite and manage members">
          <OrganizationProfilePanel />
        </section>
      </div>
    </>
  );
}

function ActivityRow({ row }: { row: TeamActivityRow }) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex min-w-0 items-center gap-2.5">
          <RowAvatar row={row} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.name}</p>
            {row.identifier ? (
              <p className="text-muted-foreground truncate text-xs">
                {row.identifier}
              </p>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell>
        {row.kind === "member" ? (
          <Badge variant="secondary" className="text-[11px] font-normal">
            {roleLabel(row.role)}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[11px] font-normal">
            {row.kind === "api" ? "Workspace" : "Departed"}
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {row.generations.toLocaleString()}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {row.characters.toLocaleString()}
      </TableCell>
      <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
        {row.lastActiveAt ? new Date(row.lastActiveAt).toLocaleDateString() : "—"}
      </TableCell>
    </TableRow>
  );
}

function RowAvatar({ row }: { row: TeamActivityRow }) {
  if (row.kind === "api") {
    return (
      <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full">
        <KeyRound className="size-3.5" aria-hidden="true" />
      </span>
    );
  }
  if (row.kind === "former") {
    return (
      <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full">
        <UserX className="size-3.5" aria-hidden="true" />
      </span>
    );
  }
  return (
    <Avatar className="size-7">
      {row.imageUrl ? <AvatarImage src={row.imageUrl} alt="" /> : null}
      <AvatarFallback className="text-[10px]">
        {row.name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
