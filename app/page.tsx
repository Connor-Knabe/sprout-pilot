import { SproutDashboard } from "./components/SproutDashboard";

export default function Home() {
  return (
    <SproutDashboard demoMode={process.env.SPROUT_LOCAL_DEMO === "true"} />
  );
}
