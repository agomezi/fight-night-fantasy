import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import { Platform, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import FightCard from "./FightCard";
import { makeCommonStyles } from "../styles/common";

export interface Card {
  tag: string;
  tagColor: string;
  title?: string;
  subtitle?: string;
  aspectRatio?: number;
  /** Replaces title/subtitle entirely — used for the picks ring. */
  content?: React.ReactNode;
  /** Oversized ghost text behind the card — usually the event number. */
  watermark?: string;
  /** Small mono text on the right of the header band. */
  serial?: string;
  footer?: React.ReactNode;
}

// Soft settle — no visible overshoot, so repeated swiping doesn't feel wobbly.
const SETTLE = { damping: 20, stiffness: 220, mass: 0.6 };
const SWIPE_DISTANCE = 55;
const SWIPE_VELOCITY = 450;

const SwipeableCards = ({
  cards,
  minHeight,
}: {
  cards: Card[];
  /** Holds one height across cards so swiping doesn't jolt the page. */
  minHeight?: number;
}) => {
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const { width: windowWidth } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const translateX = useSharedValue(0);

  useEffect(() => {
    setIndex((prev) =>
      cards.length === 0 ? 0 : Math.min(prev, cards.length - 1),
    );
  }, [cards.length]);

  const bump = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, []);

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
        translateX.value = withSpring(0, SETTLE);
        return;
      }
      bump();

      // Throw the outgoing card off-screen, then drop the incoming one just
      // off the opposite edge and spring it home. Springing (rather than
      // timing) the arrival is what stops it feeling mechanical.
      translateX.value = withTiming(
        direction * -windowWidth,
        { duration: 180 },
        (done) => {
          if (!done) return;
          runOnJS(advanceIndex)(direction);
          translateX.value = direction * windowWidth * 0.6;
          translateX.value = withSpring(0, SETTLE);
        },
      );
    },
    [advanceIndex, bump, cards.length, translateX, windowWidth],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      // Rubber-banding: the further you drag, the less it follows, so the
      // card feels physically attached rather than glued to your finger.
      const raw = event.translationX;
      translateX.value = Math.sign(raw) * Math.pow(Math.abs(raw), 0.85);
    })
    .onEnd((event) => {
      const far = Math.abs(event.translationX) >= SWIPE_DISTANCE;
      const fast = Math.abs(event.velocityX) >= SWIPE_VELOCITY;

      if (far || fast) {
        runOnJS(goToRelativeCard)(event.translationX < 0 ? 1 : -1);
        return;
      }
      translateX.value = withSpring(0, SETTLE);
    });

  const animatedStyle = useAnimatedStyle(() => {
    const progress = Math.abs(translateX.value) / windowWidth;
    return {
      transform: [
        { translateX: translateX.value },
        // A few degrees of tilt in the drag direction reads as weight.
        {
          rotateZ: `${interpolate(
            translateX.value,
            [-windowWidth, 0, windowWidth],
            [-6, 0, 6],
            Extrapolation.CLAMP,
          )}deg`,
        },
        // Shrink slightly as it leaves, like it's receding.
        { scale: interpolate(progress, [0, 1], [1, 0.92], Extrapolation.CLAMP) },
      ],
      opacity: interpolate(progress, [0, 0.75], [1, 0.4], Extrapolation.CLAMP),
    };
  });

  if (cards.length === 0) {
    return null;
  }

  const card = cards[index] ?? cards[0];
  if (!card) {
    return null;
  }

  return (
    <View>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle}>
          <FightCard
            label={card.tag}
            labelColor={card.tagColor}
            watermark={card.watermark}
            serial={card.serial}
            minHeight={minHeight}
            style={{ aspectRatio: card.aspectRatio }}
          >
            {card.content ?? (
              <>
                {card.title ? (
                  <Text style={[commonStyles.cardTitle, { textAlign: "left" }]}>
                    {card.title}
                  </Text>
                ) : null}
                {card.subtitle ? (
                  <Text style={[commonStyles.cardSubtitle, { textAlign: "left" }]}>
                    {card.subtitle}
                  </Text>
                ) : null}
              </>
            )}
            {card.footer}
          </FightCard>
        </Animated.View>
      </GestureDetector>

      {cards.length > 1 && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
            marginTop: 12,
            marginBottom: 4,
          }}
        >
          {cards.map((_, i) => (
            <Dot key={i} active={i === index} color={c.red} idle={c.borderStrong} />
          ))}
        </View>
      )}
    </View>
  );
};

/** Pagination dot that widens into a pill when it's the active card. */
function Dot({
  active,
  color,
  idle,
}: {
  active: boolean;
  color: string;
  idle: string;
}) {
  const style = useAnimatedStyle(() => ({
    width: withSpring(active ? 18 : 6, SETTLE),
    backgroundColor: withTiming(active ? color : idle, { duration: 180 }),
  }));

  return <Animated.View style={[{ height: 6, borderRadius: 3 }, style]} />;
}

export default SwipeableCards;
