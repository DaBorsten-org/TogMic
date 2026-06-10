import { AppWrapper } from "@/components/app-wrapper";
import RootLayout from "./layout";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

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
