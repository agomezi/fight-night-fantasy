import { Text, View } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle } from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";
import { useToggleProgress } from "../hooks/useToggleProgress";
import type { BoardView, CommunityView, PollView } from "../services/community";
import type { Card } from "./InfoCards";
import PressableScale from "./PressableScale";

/** Poll button that fills red as it's chosen, with its share once the split shows. */
function VoteButton({
  label,
  pct,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  pct: number | null;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const progress = useToggleProgress(selected);

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [c.card, c.red]),
    borderColor: interpolateColor(progress.value, [0, 1], [c.borderStrong, c.red]),
  }));

  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [c.text, "#FFFFFF"]),
  }));

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic="medium"
      style={[{ flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center", borderWidth: 1 }, boxStyle]}
    >
      <Animated.Text style={[{ fontSize: 16, fontWeight: "700", letterSpacing: 2 }, textStyle]}>
        {pct == null ? label : `${label} · ${pct}%`}
      </Animated.Text>
    </PressableScale>
  );
}

function Line({ text, strong }: { text: string; strong?: boolean }) {
  const { c } = useTheme();
  return (
    <Text style={{ color: strong ? c.text : c.text2, fontSize: 13, lineHeight: 18, fontWeight: strong ? "700" : "400" }}>
      {text}
    </Text>
  );
}

function PollFooter({ poll, busy, onVote }: { poll: PollView; busy: boolean; onVote: (option: string) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ marginTop: 8, gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {poll.options.map((o) => (
          <VoteButton
            key={o.key}
            label={o.label}
            pct={o.pct}
            selected={o.selected}
            disabled={!poll.open || busy}
            onPress={() => onVote(o.key)}
          />
        ))}
      </View>
      {poll.agreeLine ? (
        <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 }}>{poll.agreeLine}</Text>
      ) : null}
      {poll.consensus ? <Line text={poll.consensus} /> : null}
      {poll.outcome ? <Line text={[poll.outcome, poll.verdict].filter(Boolean).join(" ")} strong /> : null}
    </View>
  );
}

function BoardFooter({ board }: { board: BoardView }) {
  const { c } = useTheme();
  return (
    <View style={{ marginTop: 8, gap: 8 }}>
      {board.rows.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: "800", width: 18 }}>{r.place}</Text>
          <Text style={{ flex: 1, color: r.isMe ? c.red : c.text, fontSize: 15, fontWeight: "700" }} numberOfLines={1}>
            {r.isMe ? `${r.name} (you)` : r.name}
          </Text>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: "800" }}>{r.points}</Text>
        </View>
      ))}
      {board.lines.map((l) => (
        <Line key={l} text={l} />
      ))}
    </View>
  );
}

/** The one Community card, as an InfoCards card. Null when there's nothing to show. */
export function communityCard(
  view: CommunityView,
  tagColor: string,
  busy: boolean,
  onVote: (option: string) => void
): Card | null {
  if (view.type === "poll") {
    return {
      tag: view.poll.tag,
      tagColor,
      title: view.poll.question,
      subtitle: view.poll.subtitle,
      // The card's base fills red with the share who agree with you.
      fill: view.poll.agree ?? 0,
      footer: <PollFooter poll={view.poll} busy={busy} onVote={onVote} />,
    };
  }
  if (view.type === "board") {
    return {
      tag: view.board.tag,
      tagColor,
      title: view.board.title,
      subtitle: view.board.subtitle,
      footer: <BoardFooter board={view.board} />,
    };
  }
  return null;
}
