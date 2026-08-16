import { describe, expect, it } from "vitest";

describe("Expo build token", () => {
  it.skipIf(!process.env.EXPO_TOKEN)("authenticates with the Expo account API", async () => {
    const token = process.env.EXPO_TOKEN;
    expect(token, "EXPO_TOKEN must be configured for cloud builds").toBeTruthy();

    const response = await fetch("https://api.expo.dev/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "query { me { id } }" }),
    });

    expect(response.status, "Expo token must be accepted by the account API").toBe(200);
  }, 15_000);
});
