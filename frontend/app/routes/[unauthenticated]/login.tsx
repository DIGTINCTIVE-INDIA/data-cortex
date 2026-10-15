import { useApi } from "@/lib/useApi";
import { motion } from "framer-motion";

const LoginPage = () => {
  const { data } = useApi("GET /api/auth/sso/url");

  const onContinueClick = () => {
    if (data?.data.url) {
      window.location.href = data.data.url;
    }
  };

  return (
    <div className="min-h-screen text-white relative overflow-hidden">
      {/* GLOBAL BACKGROUND */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#0b1220] to-[#020617]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(59,130,246,0.25),transparent_40%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(99,102,241,0.2),transparent_40%)]" />

      {/* CONTENT */}
      <div className="relative z-10 flex flex-col lg:flex-row w-full min-h-screen pb-24 sm:pb-0">
        {/* LEFT / HERO */}
        <div className="w-full lg:w-1/2 px-6 pt-10 lg:p-16 flex flex-col justify-center lg:justify-between">
          {/* LOGO */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 mb-8 lg:mb-0">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <span className="text-lg lg:text-xl font-bold">DC</span>
            </div>
            <span className="text-lg lg:text-xl font-semibold">DataCortex</span>
          </motion.div>

          {/* HERO TEXT */}
          <div className="max-w-lg">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
              Turn Data Into
              <span className="text-blue-500 block mt-2">Reliable Insights</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 lg:mt-6 text-gray-400 text-sm md:text-base lg:text-lg">
              Monitor data quality, detect anomalies, and manage pipelines with confidence. Automated checks, alerts,
              and insights in one place.
            </motion.p>
          </div>

          {/* FOOTER */}
          <div className="hidden lg:block text-sm text-gray-500">© 2026 DataCortex</div>
        </div>

        {/* RIGHT / LOGIN */}
        <div className="w-full lg:w-1/2 flex items-center justify-center px-6 pb-10 lg:pb-0">
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
            <div className="relative">
              {/* GLOW */}
              <div className="absolute inset-0 rounded-3xl bg-blue-600/10 blur-2xl" />

              {/* CARD */}
              <div className="relative bg-white/5 backdrop-blur-2xl border border-white/10  mt-6 lg:mt-0 rounded-3xl p-6 md:p-8 lg:p-10 shadow-2xl">
                <div className="mb-6 text-center">
                  <h2 className="text-2xl md:text-3xl font-semibold">Welcome Back</h2>
                  <p className="text-gray-400 mt-2 text-sm">Continue to your workspace</p>
                </div>

                {/* DESKTOP BUTTON */}
                <div className="hidden sm:block">
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    whileHover={{ scale: 1.02 }}
                    onClick={onContinueClick}
                    className="w-full cursor-pointer relative overflow-hidden group bg-white text-black font-medium py-3 md:py-4 rounded-xl flex items-center justify-center gap-3 shadow-lg">
                    <span className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 group-hover:opacity-10 transition" />

                    <svg className="w-5 h-5 md:w-6 md:h-6 relative z-10" viewBox="0 0 23 23">
                      <path d="M0 0h11v11H0z" fill="#f25022" />
                      <path d="M12 0h11v11H12z" fill="#00adef" />
                      <path d="M0 12h11v11H0z" fill="#7fba00" />
                      <path d="M12 12h11v11H12z" fill="#ffb900" />
                    </svg>

                    <span className="relative z-10 text-sm md:text-base">Continue with Microsoft</span>
                  </motion.button>
                </div>

                <div className="text-center mt-5 text-xs text-gray-500">
                  Secure authentication via Microsoft Entra ID
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* MOBILE FIXED CTA */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-[#020617] via-[#020617]/90 to-transparent">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onContinueClick}
          className="w-full bg-white text-black font-medium py-4 rounded-xl flex items-center justify-center gap-3 shadow-lg">
          <svg className="w-5 h-5" viewBox="0 0 23 23">
            <path d="M0 0h11v11H0z" fill="#f25022" />
            <path d="M12 0h11v11H12z" fill="#00adef" />
            <path d="M0 12h11v11H0z" fill="#7fba00" />
            <path d="M12 12h11v11H12z" fill="#ffb900" />
          </svg>
          Continue with Microsoft
        </motion.button>
      </div>
    </div>
  );
};

export default LoginPage;
