import { useState } from "react";

import PageHeader from "@/components/layout/PageHeader";
import { AnimatedTabs } from "@/components/ui/custom/AnimatedTabs";
import { UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import AddUserForm from "./components/AddUserForm";
import ServiceUsersPanel from "./components/ServiceUsersPanel";
import UserTable from "./components/UserTable";

type Tab = "people" | "service";

/**
 * One page for everything that can reach this system.
 *
 * People and service identities are both rows in `users`, and both answer the
 * same admin question -- "who has access, and what can they do". They were two
 * separate pages, which meant a service identity was only findable if you
 * already knew it was a user.
 *
 * They stay as two tabs rather than one list because a row means different
 * things: a person has an email and an assignable role; a service identity has
 * neither and carries API keys instead. Merging them into one table would leave
 * half of every row empty.
 */
export default function UserManagement() {
  const [tab, setTab] = useState<Tab>("people");

  return (
    <>
      <div className="flex items-center justify-between">
        <PageHeader
          title="Users & Access"
          description="People who sign in, and the service identities other systems use."
        />
        <div className="hidden md:flex size-11 rounded-2xl bg-primary/10 text-primary items-center justify-center">
          <HugeiconsIcon icon={UserGroupIcon} size={22} />
        </div>
      </div>

      <AnimatedTabs
        value={tab}
        onValueChange={value => setTab(value as Tab)}
        tabs={[
          { value: "people", label: "People" },
          { value: "service", label: "Service Users" },
        ]}
        className="max-w-md"
      />

      {tab === "people" ? (
        <>
          <AddUserForm />
          <UserTable />
        </>
      ) : (
        <ServiceUsersPanel />
      )}
    </>
  );
}
