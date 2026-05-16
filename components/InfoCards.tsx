import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { commonStyles } from "../styles/common";

export interface Card {
  tag?: string;
  tagColor?: string;
  tagSize?: number;
  title?: string;
  titleSize?: number;
  titleUnit?: string;
  subtitle?: string;
  aspectRatio?: number;
  delta?: number;
  footer?: React.ReactNode;
}

export function InfoCards({ cards }: { cards: Card[] }) {
  if (cards.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      {cards.map((card, i) => (
        <View
          key={i}
          style={[commonStyles.homeCard, { aspectRatio: card.aspectRatio }]}
        >
          <Text
            style={[
              commonStyles.label,
              { color: card.tagColor, fontSize: card.tagSize },
            ]}
          >
            {card.tag}
          </Text>
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
        </View>
      ))}
    </View>
  );
}

export default InfoCards;
