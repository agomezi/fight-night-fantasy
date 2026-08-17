import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { appear } from "../constants/motion";
import { useThemedStyles } from "../context/ThemeContext";
import FightCard from "./FightCard";
import { makeCommonStyles } from "../styles/common";

export interface Card {
  tag?: string;
  tagColor?: string;
  tagSize?: number;
  title?: string;
  titleSize?: number;
  titleUnit?: string;
  subtitle?: string;
  aspectRatio?: number;
  /** Small mono text on the right of the header band. */
  serial?: string;
  /** Full-bleed zone under the header — fighter art. */
  media?: React.ReactNode;
  /** Large faint graphic behind the body. */
  mark?: React.ReactNode;
  delta?: number;
  footer?: React.ReactNode;
}

export function InfoCards({ cards }: { cards: Card[] }) {
  const commonStyles = useThemedStyles(makeCommonStyles);
  if (cards.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      {cards.map((card, i) => (
        <Animated.View key={i} entering={appear(i)}>
          <FightCard
            label={card.tag ?? ""}
            labelColor={card.tagColor ?? "#666"}
            serial={card.serial}
            media={card.media}
            mark={card.mark}
            style={{ aspectRatio: card.aspectRatio }}
          >
          <View style={commonStyles.infoCardTitleRow}>
            <Text
              style={[
                commonStyles.cardTitle,
                commonStyles.infoCardTitle,
                { fontSize: card.titleSize },
              ]}
            >
              {card.title}
            </Text>
            {card.titleUnit ? (
              <Text style={commonStyles.titleUnit}>{card.titleUnit}</Text>
            ) : null}
            {typeof card.delta === "number" && card.delta !== 0 ? (
              <View style={commonStyles.deltaRow}>
                <Ionicons
                  name={card.delta > 0 ? "arrow-up" : "arrow-down"}
                  size={18}
                  style={
                    card.delta > 0
                      ? commonStyles.deltaPositive
                      : commonStyles.deltaNegative
                  }
                />
                <Text
                  style={[
                    commonStyles.deltaText,
                    card.delta > 0
                      ? commonStyles.deltaPositive
                      : commonStyles.deltaNegative,
                  ]}
                >
                  {card.delta > 0 ? `+${card.delta}` : `${card.delta}`}
                </Text>
              </View>
            ) : null}
          </View>
          {card.subtitle ? (
            <Text style={[commonStyles.cardSubtitle, { textAlign: "left" }]}>
              {card.subtitle}
            </Text>
          ) : null}
          {card.footer}
          </FightCard>
        </Animated.View>
      ))}
    </View>
  );
}

export default InfoCards;
