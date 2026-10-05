import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import DriverApp from './DriverApp';
import PassengerApp from './PassengerApp';
import { Button } from './components/ui/button';
import { Car, User as UserIcon, LogIn } from 'lucide-react';

function Home() {
  const navigate = useNavigate();
  return (
    <div className="min-h-[100dvh] bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="z-10 flex flex-col items-center text-center max-w-md w-full">
        <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(255,255,255,0.2)]">
          <Car className="h-10 w-10 text-black" />
        </div>
        
        <h1 className="text-4xl font-black mb-2 tracking-tight">Driver App Pro</h1>
        <p className="text-zinc-400 mb-12 text-lg">Escolha como deseja acessar a plataforma.</p>
        
        <div className="flex flex-col gap-4 w-full">
          <Button 
            size="lg" 
            className="h-16 text-lg font-bold rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all hover:scale-[1.02]" 
            onClick={() => navigate('/driver')}
          >
            <Car className="mr-3 h-6 w-6" /> Entrar como Motorista
          </Button>
          
          <Button 
            size="lg" 
            variant="outline" 
            className="h-16 text-lg font-bold rounded-2xl border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-white transition-all hover:scale-[1.02]" 
            onClick={() => navigate('/passenger')}
          >
            <UserIcon className="mr-3 h-6 w-6" /> Entrar como Passageiro
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-[100dvh] bg-black flex items-center justify-center text-white">Carregando...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-[100dvh] bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="z-10 flex flex-col items-center text-center max-w-md w-full">
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(255,255,255,0.2)]">
            <Car className="h-10 w-10 text-black" />
          </div>
          <h1 className="text-4xl font-black mb-2 tracking-tight">Driver App Pro</h1>
          <p className="text-zinc-400 mb-12 text-lg">Faça login para continuar.</p>
          <Button 
            size="lg" 
            className="h-16 w-full text-lg font-bold rounded-2xl bg-white hover:bg-gray-200 text-black transition-all hover:scale-[1.02]" 
            onClick={async () => {
              try {
                await signInWithPopup(auth, new GoogleAuthProvider());
              } catch (error: any) {
                console.error("Login error:", error);
                alert("Erro ao fazer login: " + error.message);
              }
            }}
          >
            <LogIn className="mr-3 h-6 w-6" /> Entrar com Google
          </Button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/driver" element={<DriverApp />} />
        <Route path="/passenger" element={<PassengerApp />} />
      </Routes>
    </BrowserRouter>
  );
}
