import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import type { SereinePalette } from "../constants/sereine-palette";

type Props = {
  palette: SereinePalette;
  size?: number;
  showRings?: boolean;
  ringDelayMs?: number;
  testID?: string;
};

const BREATHE_DURATION = 3500;

export function BreathingCircle({
  palette,
  size = 96,
  showRings = true,
  ringDelayMs = 0,
  testID,
}: Props) {
  const ringInner = useBreathingProgress(0, 0.78, 1.08, 0.35, 0.7);
  const ringOuter = useBreathingProgress(ringDelayMs, 0.78, 1.08, 0.35, 0.7);
  const core = useBreathingProgress(0, 0.86, 1.0, 0.85, 1);

  const ringSize = size + 44;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: ringSize, height: ringSize }}
      className="items-center justify-center"
      testID={testID}
    >
      {showRings ? (
        <>
          <Animated.View
            style={[
              ringInner,
              {
                position: "absolute",
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                borderWidth: 1,
                borderColor: `${palette.sageDeep}55`,
              },
            ]}
          />
          <Animated.View
            style={[
              ringOuter,
              {
                position: "absolute",
                width: ringSize - 28,
                height: ringSize - 28,
                borderRadius: (ringSize - 28) / 2,
                borderWidth: 1,
                borderColor: `${palette.sageDeep}88`,
              },
            ]}
          />
        </>
      ) : null}
      <Animated.View
        style={[
          core,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: palette.sage,
            shadowColor: palette.sageDeep,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.4,
            shadowRadius: 28,
            elevation: 8,
          },
        ]}
      />
    </View>
  );
}

function useBreathingProgress(
  delayMs: number,
  scaleFrom: number,
  scaleTo: number,
  opacityFrom: number,
  opacityTo: number,
) {
  const progress = useSharedValue(0);

  useEffect(() => {
    const start = () => {
      progress.value = withRepeat(
        withTiming(1, { duration: BREATHE_DURATION, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    };
    if (delayMs > 0) {
      const id = setTimeout(start, delayMs);
      return () => clearTimeout(id);
    }
    start();
    return undefined;
  }, [delayMs, progress]);

  return useAnimatedStyle(() => {
    const scale = scaleFrom + (scaleTo - scaleFrom) * progress.value;
    const opacity = opacityFrom + (opacityTo - opacityFrom) * progress.value;
    return { transform: [{ scale }], opacity };
  });
}
