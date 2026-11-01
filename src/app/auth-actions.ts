"use server";
// Sign-out: clears the session cookie and returns to the entryway.
import { redirect } from "next/navigation";
import { endSession } from "@/lib/session";

export async function logout(): Promise<void> {
  await endSession();
  redirect("/");
}
