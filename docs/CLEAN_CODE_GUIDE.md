General Clean Code Principles
Meaningful Naming: Use clear, descriptive, and pronounceable names for variables, functions, classes, and interfaces. Avoid cryptic abbreviations.
Functions Should Do One Thing: Adhere to the Single Responsibility Principle (SRP). Functions and methods should be small, focused, and perform a single, well-defined task.
Keep Code Simple: Avoid overly complex logic or unnecessary abstractions. Favor straightforward implementations.
Avoid "Magic" Numbers and Strings: Replace raw, unexplained values with named constants to clarify their purpose.
Consistent Formatting: Stick to a single, consistent style guide across the entire project. Use tools like ESLint and Prettier to enforce formatting automatically.
Write Less Code, Write Better Comments: The code should be expressive enough to explain itself. Comments should be used sparingly, primarily to explain why something is done or to warn of consequences, not what the code is doing.
Organize Code Logically: Group related functions, classes, and interfaces together. Ensure files are reasonably sized and follow a logical structure (e.g., high-level concepts at the top, details at the bottom). 

TypeScript-Specific Rules
Use Explicit Types: Define types explicitly for function parameters, return values, and variables whenever possible. This enhances clarity and leverages TypeScript's type-checking benefits.
Prefer unknown over any: Avoid using the any type, which defeats the purpose of TypeScript. Use unknown when a value's type is truly unknown, as it forces type validation before use, leading to safer code.
Leverage Interfaces and Type Aliases Intentionally:
Interfaces are generally preferred for defining object shapes and are great for extension in object-oriented design.
Type Aliases are better for union types, tuples, and aliasing primitives.
Utilize Utility Types: Use TypeScript's built-in utility types (like Partial, Required, Readonly, etc.) to reduce boilerplate code and manage complex type transformations effectively.
Mind the Return Type of Callbacks: When a function is not intended to return a value, explicitly use void as the return type to maintain type checking integrity and prevent accidental use of potential return values.
Use Strict TypeScript Settings: Configure your tsconfig.json with strict settings (e.g., strict: true, noImplicitAny: true) to benefit from stronger type safety. 


3) CUT_PLAN_profile_screen.md (src/app/(protected)/(tabs)/profile.tsx)
Many concerns, but still mostly self-contained. Good place to centralize shared types/links.
4) CUT_PLAN_post_detail.md (src/app/(protected)/post/[id].tsx)
Higher risk because comment tree + optimistic inserts + cache behavior. Do after you’ve standardized types/util patterns.
5) CUT_PLAN_chat_detail.md (src/app/(protected)/chat/[id].tsx)
Highest complexity/risk (realtime + optimistic + pagination + gestures). Best last, after you’ve built confidence and shared utilities.