# SLOPE-LIKE GAME

1. My app is recreation of the slope game. It mimics the vibe and gameplay in many ways, with the steering control being the phone's rotation rather than the keyboard.

2. My two screens are the Home/Score screen and the Game screen. The home screen simply shows the users locally stored high score (survives closing/reponening the app, but does not save on uninstall/clear on EXPO app) and a button that takes the user to the game screen. The game screen has left/right buttons for the user click, but the game is meant to be played via rotating the phone screen. User will use this to dodge obstacles while the game gets progressively harder and harder.

3. How to set up and run the app

   1. Open a terminal in this project folder.
   2. Install dependencies:
      npm install
      Start the Expo development server:
      npx expo start
      Launch the app:
	- Press a to run on Android emulator
	- Press i to run on iOS simulator (macOS only)
	- Press w to run on web
	- Or scan the QR code with Expo Go on your phone

   3. Libraries used by this project
   - expo
   - react
   - react-native
   - expo-router
   - @react-native-async-storage/async-storage
   - expo-sensors
   - @react-three/fiber
   - three
   - expo-gl
   - react-native-safe-area-context
   - @react-navigation/native
   - @react-navigation/bottom-tabs
   - @react-navigation/elements
   - react-native-screens
   - react-native-gesture-handler
   - react-native-reanimated

   4. Extra dependencies or API keys
   - No API keys are required.
   - No extra private services are required.
   - Everything needed is already declared in package.json and installed with npm install.
   
4. One thing that surprised me about mobile development is how easy it is. It's definitely because AI helps so much, but in hindsight the React Native framework is very similar to React and is quite easuy to pick up and read even for my first time. It really wasn't as hard as I thought it would be.