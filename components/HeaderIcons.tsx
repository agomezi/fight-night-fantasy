import { Circle, Path, Svg } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";

export function ProfileBadge({ size = 36 }: { size?: number }) {
  const { mode } = useTheme();
  const bg = mode === "light" ? "#FFFFFF" : "#1a0a0a";
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Circle cx="60" cy="60" r="60" fill={bg} />
      <Circle cx="60" cy="60" r="59" fill="none" stroke="#E8003D" strokeWidth="2" />
      <Circle cx="60" cy="45" r="18" fill="#E8003D" fillOpacity="0.85" />
      <Path d="M27 92C27 74.3 41.8 60 60 60C78.2 60 93 74.3 93 92Z" fill="#E8003D" fillOpacity="0.85" />
    </Svg>
  );
}

export function NotificationBell({
  size = 36,
  hasNotifications = false,
}: {
  size?: number;
  hasNotifications?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Path d="M60 20C51.16 20 44 27.16 44 36V40.5C34.6 44.8 28 54.2 28 65V82L20 92V96H100V92L92 82V65C92 54.2 85.4 44.8 76 40.5V36C76 27.16 68.84 20 60 20Z" fill="#E8003D" />
      <Path d="M48 100C48 106.6 53.4 112 60 112C66.6 112 72 106.6 72 100H48Z" fill="#E8003D" />
      {hasNotifications && (
        <>
          <Circle cx="88" cy="32" r="10" fill="#E8003D" />
          <Circle cx="88" cy="32" r="10" fill="none" stroke={c.bg} strokeWidth="2" />
        </>
      )}
    </Svg>
  );
}
