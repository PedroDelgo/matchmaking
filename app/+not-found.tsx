import React from "react";
import { router } from "expo-router";
import { Shell } from "../src/components/Shell";
import { EmptyState } from "../src/components/ui";
export default function NotFound() {
  return (
    <Shell>
      <EmptyState
        title="Essa página saiu de campo"
        description="O endereço não existe. Volte para seus campeonatos."
        actionLabel="Ir para o início"
        onAction={() => router.replace("/")}
      />
    </Shell>
  );
}
