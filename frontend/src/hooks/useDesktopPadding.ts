import { useWindowDimensions, Platform } from 'react-native';

const SIDEBAR_WIDTH = 240;
const DESKTOP_BREAKPOINT = 900;

export function useDesktopPadding() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  return isDesktop ? SIDEBAR_WIDTH : 0;
}

export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}
