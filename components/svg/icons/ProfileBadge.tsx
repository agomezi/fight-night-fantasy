import { Circle, Path, Svg } from "react-native-svg";
import { useTheme } from "../../../context/ThemeContext";

/** The account avatar in every screen header. */
export default function ProfileBadge({ size = 36 }: { size?: number }) {
  const { c } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Circle cx="60" cy="60" r="60" fill={c.surface2} />
      <Circle cx="60" cy="60" r="59" fill="none" stroke={c.red} strokeWidth="2" />
      <Circle cx="60" cy="45" r="18" fill={c.red} fillOpacity="0.85" />
      <Path
        d="M27 92C27 74.3 41.8 60 60 60C78.2 60 93 74.3 93 92Z"
        fill={c.red}
        fillOpacity="0.85"
      />
    </Svg>
  );
}
