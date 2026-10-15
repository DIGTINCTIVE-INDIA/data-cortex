import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/contexts/AuthContext";
import { Navigate, Outlet } from "react-router";

const UnProtectedLayout = () => {
  const auth = useAuthStore(state => state.auth);
  const status = auth.status;

  if (status === "loading")
    return (
      <div className="h-screen flex justify-center bg-ds-secondary-bg items-center">
        <Spinner color="white" />
      </div>
    );

  if (status === "authenticated") {
    return <Navigate to={"/analytics/dashboard"} />;
  }

  if (status === "unauthenticated") return <Outlet />;
  return <Navigate to={"/login"} />;
};

export default UnProtectedLayout;
