import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";

import type { SereinePalette } from "../constants/sereine-palette";

type Props = {
  palette: SereinePalette;
  testID?: string;
};

export function SereineWordmark({ palette, testID }: Props) {
  return (
    <View className="flex-row items-center gap-2" testID={testID}>
      <Svg width={22} height={22} viewBox="0 0 22 22">
        <Circle cx={11} cy={11} r={10} fill="none" stroke={palette.ink} strokeWidth={1.2} />
        <Circle cx={11} cy={11} r={4.5} fill={palette.ink} />
      </Svg>
      <Text
        accessibilityRole="header"
        style={{ color: palette.ink }}
        className="font-serif text-[19px] tracking-[0.4px]"
      >
        sereine
      </Text>
    </View>
  );
}
