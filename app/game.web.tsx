import { useRouter } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function GameWebFallbackScreen() {
  const router = useRouter();

  const backToMenu = () => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
    }

    requestAnimationFrame(() => {
      router.replace("/");
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>3D Mode Requires Native Runtime</Text>
        <Text style={styles.body}>
          This 3D scene uses native GL. Run on iOS or Android via Expo Go or a
          development build.
        </Text>

        <Pressable style={styles.button} onPress={backToMenu}>
          <Text style={styles.buttonText}>Back to Menu</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0A0F12",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  title: {
    color: "#EAF5FB",
    fontSize: 28,
    textAlign: "center",
    fontWeight: "800",
    marginBottom: 10,
  },
  body: {
    color: "#C7D5DE",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    maxWidth: 420,
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#D2FF4D",
    borderRadius: 12,
    minWidth: 220,
    paddingVertical: 13,
    alignItems: "center",
  },
  buttonText: {
    color: "#071014",
    fontSize: 18,
    fontWeight: "800",
  },
});
