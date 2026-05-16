import React, { useCallback, useEffect, useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { commonStyles } from "../styles/common";

export interface Card {
  tag: string;
  tagColor: string;
  title: string;
  subtitle: string;
  aspectRatio?: number;
  footer?: React.ReactNode;
}

const SwipeableCards = ({ cards }: { cards: Card[] }) => {
  const { width: windowWidth } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const translateX = useSharedValue(0);

  useEffect(() => {
    setIndex((prev) =>
      cards.length === 0 ? 0 : Math.min(prev, cards.length - 1),
    );
  }, [cards.length]);

  const advanceIndex = useCallback(
    (direction: number) => {
      setIndex(
        (prev) =>
          (prev + (direction === 1 ? 1 : -1) + cards.length) % cards.length,
      );
    },
    [cards.length],
  );

  const goToRelativeCard = useCallback(
    (direction: number) => {
      if (cards.length < 2) {
        translateX.value = withSpring(0);
        return;
      }

      const outgoingTarget = direction * -windowWidth;
      const incomingStart = direction * windowWidth;

      translateX.value = withTiming(
        outgoingTarget,
        { duration: 220 },
        (done) => {
          if (!done) {
            return;
          }
          runOnJS(advanceIndex)(direction);
          translateX.value = incomingStart;
          translateX.value = withTiming(0, { duration: 220 });
        },
      );
    },
    [advanceIndex, cards.length, translateX, windowWidth],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      if (event.translationX <= -50) {
        runOnJS(goToRelativeCard)(1);
        return;
      }

      if (event.translationX >= 50) {
        runOnJS(goToRelativeCard)(-1);
        return;
      }

      translateX.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (cards.length === 0) {
    return null;
  }

  const card = cards[index] ?? cards[0];
  if (!card) {
    return null;
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>
        <View
          style={[commonStyles.homeCard, { aspectRatio: card.aspectRatio }]}
        >
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
    </GestureDetector>
  );
};

export default SwipeableCards;
