jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("@expo/vector-icons/Ionicons", () => ({
  __esModule: true,
  default: Object.assign(() => null, { glyphMap: {} }),
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
// Animation is presentation-only; domain results and interactions remain real.
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  const animation = {
    duration: () => animation,
    delay: () => animation,
    easing: () => animation,
    springify: () => animation,
    damping: () => animation,
    stiffness: () => animation,
    withInitialValues: () => animation,
  };
  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent: (Component: unknown) => Component,
    },
    useSharedValue: (value: unknown) => {
      const ref = require("react").useRef(null);
      if (!ref.current)
        ref.current = {
          value,
          get() {
            return this.value;
          },
          set(next: unknown) {
            this.value = next;
          },
        };
      return ref.current;
    },
    useAnimatedStyle: (callback: () => unknown) => callback(),
    withTiming: (value: unknown) => value,
    withSpring: (value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withDelay: (_delay: number, value: unknown) => value,
    cancelAnimation: jest.fn(),
    Easing: {
      in: (value: unknown) => value,
      out: (value: unknown) => value,
      inOut: (value: unknown) => value,
      quad: (value: number) => value,
      cubic: (value: number) => value,
      exp: (value: number) => value,
    },
    FadeIn: animation,
    FadeOut: animation,
    FadeInLeft: animation,
    FadeInRight: animation,
    FadeInDown: animation,
    ZoomIn: animation,
    SlideInLeft: animation,
    SlideInRight: animation,
    LinearTransition: animation,
  };
});
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    dismissTo: jest.fn(),
  },
  usePathname: jest.fn(() => "/"),
  useLocalSearchParams: jest.fn(() => ({})),
  useFocusEffect: (callback: () => void | (() => void)) => {
    require("react").useEffect(callback, [callback]);
  },
}));
jest.mock("../src/components/Shell", () => ({
  Shell: ({ children }: { children: React.ReactNode }) => children,
}));
