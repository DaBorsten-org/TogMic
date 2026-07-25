import { AppWrapper } from "@/components/app-wrapper";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import RootLayout from "./layout";

export function App() {
  return (
    <RootLayout>
      <ThemeProvider>
        <AppWrapper />
        <Toaster />
      </ThemeProvider>
    </RootLayout>
  );
}

export default App;
