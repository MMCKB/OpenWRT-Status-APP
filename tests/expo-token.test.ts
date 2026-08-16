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

  it.skipIf(!process.env.EXPO_SOURCE_TOKEN)("authenticates the source account token for project migration", async () => {
    const token = process.env.EXPO_SOURCE_TOKEN;
    expect(token, "EXPO_SOURCE_TOKEN must be configured for source-project access").toBeTruthy();

    const response = await fetch("https://api.expo.dev/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "query { me { id } }" }),
    });

    expect(response.status, "Source Expo token must be accepted by the account API").toBe(200);
  }, 15_000);

  it.skipIf(!process.env.EXPO_TOKEN || !process.env.EXPO_SOURCE_TOKEN)("uses distinct source and destination Expo accounts", async () => {
    const fetchAccountId = async (token: string) => {
      const response = await fetch("https://api.expo.dev/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "query { me { id } }" }),
      });
      const payload = (await response.json()) as { data?: { me?: { id?: string } } };
      return payload.data?.me?.id;
    };

    const [sourceId, destinationId] = await Promise.all([
      fetchAccountId(process.env.EXPO_SOURCE_TOKEN!),
      fetchAccountId(process.env.EXPO_TOKEN!),
    ]);

    expect(sourceId, "Source Expo account id must be available").toBeTruthy();
    expect(destinationId, "Destination Expo account id must be available").toBeTruthy();
    expect(sourceId, "Source and destination tokens must belong to different Expo accounts").not.toBe(destinationId);
  }, 15_000);
});
