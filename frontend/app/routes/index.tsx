import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/contexts/AuthContext";
import { Navigate } from "react-router";

const Index = () => {
  const auth = useAuthStore(state => state.auth);
  const status = auth.status;
  
  if (status == "unauthenticated") {
    return <Navigate to="/login" />;
  }

  if (status == "authenticated") {
    return <Navigate to="/analytics/dashboard" />;
  }

  return (
    <div className="h-screen w-screen bg-dc-blue-500 flex items-center justify-center">
      <Spinner className="size-8" color="white" />
    </div>
  );
};

export default Index;
