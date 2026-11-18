jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("@expo/vector-icons/Ionicons", () => ({
  __esModule: true,
  default: Object.assign(() => null, { glyphMap: {} }),
}));
// Animation is presentation-only; domain results and interactions remain real.
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  const animation = { duration: () => animation, delay: () => animation };
  return {
    __esModule: true,
    default: { View },
    FadeInDown: animation,
    SlideInLeft: animation,
    SlideInRight: animation,
  };
});
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
  usePathname: () => "/",
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock("../src/components/Shell", () => ({
  Shell: ({ children }: { children: React.ReactNode }) => children,
}));
