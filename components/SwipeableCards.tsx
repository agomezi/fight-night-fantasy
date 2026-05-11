import React, { useRef } from "react";
import {
  Animated,
  PanResponder,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { commonStyles } from "../styles/common";

interface Card {
  tag: string;
  tagColor: string;
  title: string;
  subtitle: string;
  aspectRatio?: number;
  footer?: React.ReactNode;
}

const SwipeableCards = ({ cards }: { cards: Card[] }) => {
  const { width: windowWidth } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;
  const indexRef = useRef(0);
  const [index, setIndex] = React.useState(0);

  const slideOut = (direction: number) => {
    Animated.timing(translateX, {
      toValue: direction * -windowWidth,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      const next =
        (indexRef.current + (direction === 1 ? 1 : -1) + cards.length) %
        cards.length;
      indexRef.current = next;
      setIndex(next);
      translateX.setValue(direction * windowWidth);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8,
      onPanResponderMove: (_, g) => translateX.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -50) slideOut(1);
        else if (g.dx > 50) slideOut(-1);
        else
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
      },
    }),
  ).current;

  const card = cards[index];

  return (
    <Animated.View
      style={[{ transform: [{ translateX }] }]}
      {...panResponder.panHandlers}
    >
      <View style={[commonStyles.homeCard, { aspectRatio: card.aspectRatio }]}>
        <Text style={[commonStyles.label, { color: card.tagColor }]}>
          {card.tag}
        </Text>
        <Text style={[commonStyles.cardTitle, { textAlign: "left" }]}>
          {card.title}
        </Text>
        <Text style={[commonStyles.cardSubtitle, { textAlign: "left" }]}>
          {card.subtitle}
        </Text>
        {card.footer}
      </View>
    </Animated.View>
  );
};

export default SwipeableCards;
