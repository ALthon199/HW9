Cursor/Claude Sonnet 4.6

# React Native 
1. "What are some react native concepts to understand and why it differs"
   
Component model (same React mindset)
You still build UI with components, props, state, hooks, and unidirectional data flow.
Why it matters: your React knowledge transfers, but the rendering target is different.

Styles are JavaScript objects, not CSS files.
Flexbox is the main layout system, but defaults differ from web CSS.
Why it differs: there is no browser layout engine or full CSS cascade.

2. "Focus mainly on stack and how it work" IN the context of typical react routing

Think of it like a pile of screens:

When you open a new screen, it gets pushed on top.
When you go back, top screen is popped off.
The screen below becomes visible again.
How it works:

App starts at an initial route, for example Home.
You navigate to Game, Game is pushed on top of Home.
You navigate to Settings, Settings is pushed on top of Game.
Back action removes Settings, returns to Game.

3. "What is safeview?"
   
SafeAreaView is a layout wrapper that keeps your UI inside the device safe area, so content does not get hidden by:

iPhone notch or Dynamic Island
Rounded corners
Status bar area
Home indicator area at bottom


# Development

1. "Look at understand SPEC.md and began implementing. Ask questions if needed"

Provided general gameplay and movement of the ball.

2. "Research the game slope and give a list of all of the games core features"
   
My SPEC.md was not detailed enough, so I asked it help me understand all the core features of slope.

## Incremental Additions

These were prompts I did to add small additions that were left out of my spec.

1. "The Camera should follow. Camera's X axis and Y axis should be with the ball".

2. "Slope has ramps that allow the user to fly across obstacles. For the sake of ease, these should clearly distinguishable (e.g. different color). "

3. "Slope has multiple pathways for players to take. Remake the map generation with this in mind. THe pathways should be possible." 

4. "Overall, this game needs to feel like the matrix. Obstacles and the map should have matrix-like lines and the background should feel like were delving deep into the matrix."







