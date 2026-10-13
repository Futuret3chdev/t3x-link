import { createFileRoute } from "@tanstack/react-router";
import { Command } from "@/components/t3x/command";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Command />;
}
