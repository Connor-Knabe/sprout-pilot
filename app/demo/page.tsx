import type { Metadata } from "next";
import { SproutDashboard } from "../components/SproutDashboard";

export const metadata: Metadata = {
  title: "Interactive demo | Sprout Pilot",
  description:
    "Explore mocked plant, weather, and controller safety scenarios without connected hardware.",
};

export default function DemoPage() {
  return <SproutDashboard demoMode />;
}
