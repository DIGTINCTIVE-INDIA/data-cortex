import { Outlet } from "react-router";
import { QcFIleConfProvider } from "./context/QcFIleConfProvider.js";

export default function QCFileConfigurationLayout() {
  return (
    <QcFIleConfProvider>
      <Outlet />
    </QcFIleConfProvider>
  );
}
