import HouseScene from "./view/HouseScene";
import StatusBar from "./ui/StatusBar";
import Terminal from "./ui/Terminal";

export default function App() {
  return (
    <main className="app">
      <HouseScene />
      <StatusBar />
      <Terminal />
    </main>
  );
}
