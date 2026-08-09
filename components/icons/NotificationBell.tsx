import { Circle, Path, Svg } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";

/** Header bell. The dot only appears when there's something to see. */
export default function NotificationBell({
  size = 36,
  hasNotifications = false,
}: {
  size?: number;
  hasNotifications?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Path
        d="M60 20C51.16 20 44 27.16 44 36V40.5C34.6 44.8 28 54.2 28 65V82L20 92V96H100V92L92 82V65C92 54.2 85.4 44.8 76 40.5V36C76 27.16 68.84 20 60 20Z"
        fill={c.red}
      />
      <Path
        d="M48 100C48 106.6 53.4 112 60 112C66.6 112 72 106.6 72 100H48Z"
        fill={c.red}
      />
      {hasNotifications && (
        <>
          <Circle cx="88" cy="32" r="10" fill={c.red} />
          <Circle cx="88" cy="32" r="10" fill="none" stroke={c.bg} strokeWidth="2" />
        </>
      )}
    </Svg>
  );
}
