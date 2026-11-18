import React, { useState } from "react";
import { View } from "react-native";
import type { Tournament } from "../features/tournaments/domain/types";
import { TournamentCard } from "./tournament";
import { Motion } from "./Motion";
import { tokens } from "../theme/tokens";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";

// Measure the actual container: the Home sidebar and tablet gutters matter.
export function TournamentGrid({
  tournaments,
  maxColumns = 3,
}: {
  tournaments: Tournament[];
  maxColumns?: number;
}) {
  const [width, setWidth] = useState(0),
    { tablet } = useResponsiveLayout();
  const gap = tokens.spacing.section;
  const columns = tablet
    ? Math.min(maxColumns, Math.max(1, Math.floor((width + gap) / (320 + gap))))
    : 1;
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: "row", flexWrap: "wrap", gap }}
    >
      {tournaments.map((t, i) => (
        <View
          key={t.id}
          style={{
            width:
              columns === 1 ? "100%" : (width - gap * (columns - 1)) / columns,
          }}
        >
          <Motion
            delay={Math.min(i, 4) * tokens.motion.stagger}
            style={{ flex: 1 }}
          >
            <TournamentCard tournament={t} />
          </Motion>
        </View>
      ))}
    </View>
  );
}
