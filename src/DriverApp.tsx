import { useNavigate } from 'react-router-dom';

// ... (keep existing imports)
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, User, DollarSign, MapPin, Navigation, CheckCircle, ShieldCheck, Power, BellRing, X, ArrowUpRight, ArrowUpLeft, ArrowUp, AlertTriangle, MessageCircle, Phone, History, Settings, Car, ChevronRight, Send, Home, Star, ArrowLeft, Wallet, TrendingUp, Edit2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import MapComponent from './components/MapComponent';
import { getOSRMRoute, RouteStep, calculateDistance } from './lib/routing';
import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from './components/ui/avatar';
import { Badge } from './components/ui/badge';
import { Separator } from './components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./components/ui/sheet";

import { db, auth } from './firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy, limit, arrayUnion, getDocs } from 'firebase/firestore';

type AppState = 'OFFLINE' | 'ONLINE' | 'REQUEST' | 'EN_ROUTE_PICKUP' | 'ARRIVED' | 'EN_ROUTE_DROPOFF' | 'COMPLETED';

// ... (keep RideRequest interface and INITIAL_LOCATION)
interface RideRequest {
  id: string;
  pickupName: string;
  dropoffName: string;
  pickupLocation: [number, number];
  dropoffLocation: [number, number];
  estimatedPrice: number;
  distance: number;
  time: number;
  passengerName: string;
  passengerRating: number;
}

const INITIAL_LOCATION: [number, number] = [-23.5505, -46.6333]; // São Paulo

export default function DriverApp() {
  const navigate = useNavigate();
  // ... (keep all existing state and logic)
  const [appState, setAppState] = useState<AppState>('OFFLINE');
  const [driverLocation, setDriverLocation] = useState<[number, number]>(INITIAL_LOCATION);
  const [earningsToday, setEarningsToday] = useState(145.50);
  const [currentRide, setCurrentRide] = useState<RideRequest | null>(null);
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [routeProgress, setRouteProgress] = useState(0);
  
  // Navigation State
  const [navigationSteps, setNavigationSteps] = useState<RouteStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [trafficAlert, setTrafficAlert] = useState<string | null>(null);
  const [isNavigationMode, setIsNavigationMode] = useState(false);
  
  // UI States
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{sender: 'driver'|'passenger', text: string}[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [rideHistory, setRideHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [profileName, setProfileName] = useState('Roberto J.');
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setDriverLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.error("Error getting location:", error);
        },
        { enableHighAccuracy: true }
      );
    }
  }, []);

  // Mock data for the wallet chart
  const weeklyEarnings = [
    { name: 'Seg', amount: 120 },
    { name: 'Ter', amount: 150 },
    { name: 'Qua', amount: 90 },
    { name: 'Qui', amount: 180 },
    { name: 'Sex', amount: 250 },
    { name: 'Sáb', amount: 310 },
    { name: 'Dom', amount: 145.50 },
  ];

  const loadHistory = async () => {
    if (!auth.currentUser) return;
    setIsLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'rides'),
        where('driverId', '==', auth.currentUser.uid),
        where('status', '==', 'COMPLETED'),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRideHistory(history);
    } catch (e) {
      console.error("Error loading history:", e);
      showToast("Erro ao carregar histórico.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isHistoryOpen) {
      loadHistory();
    }
  }, [isHistoryOpen]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };
  
  const simulationInterval = useRef<NodeJS.Timeout | null>(null);

  // Firebase integration for listening to requests
  useEffect(() => {
    if (appState !== 'ONLINE') return;

    const q = query(
      collection(db, 'rides'),
      where('status', '==', 'REQUESTING'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const rideDoc = snapshot.docs[0];
        const data = rideDoc.data();
        
        // Only show if we don't already have a request or we are online
        if (appState === 'ONLINE') {
          setCurrentRide({
            id: rideDoc.id,
            pickupName: data.pickupName || 'Localização Atual',
            dropoffName: data.dropoffName || 'Destino',
            pickupLocation: data.pickupLocation,
            dropoffLocation: data.dropoffLocation,
            estimatedPrice: data.price * 0.8, // Driver gets 80%
            distance: data.distance || 4.2,
            time: data.time || 12,
            passengerName: data.passengerName || 'Passageiro',
            passengerRating: 4.9
          });
          setAppState('REQUEST');
        }
      } else if (appState === 'REQUEST') {
        // Request was taken by someone else or cancelled
        setAppState('ONLINE');
        setCurrentRide(null);
      }
    });

    return () => unsubscribe();
  }, [appState]);

  // Firebase integration for listening to current ride updates (like cancellations)
  useEffect(() => {
    if (!currentRide?.id || appState === 'OFFLINE' || appState === 'ONLINE' || appState === 'REQUEST') return;

    const unsubscribe = onSnapshot(doc(db, 'rides', currentRide.id), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.messages) {
          setChatMessages(data.messages);
        }
        if (data.status === 'CANCELLED') {
          showToast('O passageiro cancelou a corrida.');
          setAppState('ONLINE');
          setCurrentRide(null);
          setRoute(null);
          setNavigationSteps([]);
          setIsNavigationMode(false);
        }
      }
    });

    return () => unsubscribe();
  }, [currentRide?.id, appState]);

  // Handle movement simulation and turn-by-turn updates
  useEffect(() => {
    if ((appState === 'EN_ROUTE_PICKUP' || appState === 'EN_ROUTE_DROPOFF') && route) {
      if (simulationInterval.current) clearInterval(simulationInterval.current);
      
      simulationInterval.current = setInterval(() => {
        setRouteProgress((prev) => {
          const next = prev + 1;
          if (next >= route.length) {
            clearInterval(simulationInterval.current!);
            if (appState === 'EN_ROUTE_PICKUP') {
              setAppState('ARRIVED');
              setIsNavigationMode(false);
              if (currentRide) updateDoc(doc(db, 'rides', currentRide.id), { status: 'ARRIVED' });
            } else if (appState === 'EN_ROUTE_DROPOFF') {
              setAppState('COMPLETED');
              setIsNavigationMode(false);
              if (currentRide) {
                updateDoc(doc(db, 'rides', currentRide.id), { status: 'COMPLETED' });
                setEarningsToday(prev => prev + currentRide.estimatedPrice);
              }
            }
            return prev;
          }
          
          setDriverLocation(route[next]);
          
          if (currentRide) {
            updateDoc(doc(db, 'rides', currentRide.id), { driverLocation: route[next] }).catch(console.error);
          }
          
          // Update navigation step based on progress (simplified logic)
          if (navigationSteps.length > 0) {
            const progressRatio = next / route.length;
            const stepIndex = Math.min(
              Math.floor(progressRatio * navigationSteps.length),
              navigationSteps.length - 1
            );
            setCurrentStepIndex(stepIndex);
          }

          // Random traffic alert simulation
          if (Math.random() < 0.02 && !trafficAlert) {
            setTrafficAlert('Trânsito intenso à frente. Rota recalculada para economizar 3 min.');
            setTimeout(() => setTrafficAlert(null), 8000);
          }

          return next;
        });
      }, 1000); // Move every second
    }
    
    return () => {
      if (simulationInterval.current) clearInterval(simulationInterval.current);
    };
  }, [appState, route, navigationSteps, trafficAlert, currentRide]);

  const toggleOnline = () => {
    setAppState(prev => prev === 'OFFLINE' ? 'ONLINE' : 'OFFLINE');
  };

  const acceptRide = async () => {
    if (!currentRide) return;
    if (!auth.currentUser) {
      showToast("Você precisa estar logado para aceitar corridas.");
      return;
    }
    
    try {
      await updateDoc(doc(db, 'rides', currentRide.id), {
        status: 'EN_ROUTE_PICKUP',
        driverId: auth.currentUser.uid,
        driverName: auth.currentUser.displayName || 'Motorista'
      });
      
      const routeData = await getOSRMRoute(driverLocation, currentRide.pickupLocation);
      if (routeData) {
        setRoute(routeData.coordinates);
        setNavigationSteps(routeData.steps);
      }
      setRouteProgress(0);
      setCurrentStepIndex(0);
      setIsNavigationMode(true);
      setAppState('EN_ROUTE_PICKUP');
      
      const initialMessage = { sender: 'driver', text: 'Olá, estou a caminho!', timestamp: Date.now() };
      await updateDoc(doc(db, 'rides', currentRide.id), {
        messages: arrayUnion(initialMessage)
      });
    } catch (e) {
      console.error(e);
      showToast("Erro ao aceitar corrida. Talvez outro motorista já tenha aceitado.");
      setAppState('ONLINE');
      setCurrentRide(null);
    }
  };

  const declineRide = () => {
    setCurrentRide(null);
    setAppState('ONLINE');
  };

  const startRide = async () => {
    if (!currentRide) return;
    try {
      await updateDoc(doc(db, 'rides', currentRide.id), { status: 'EN_ROUTE_DROPOFF' });
      const routeData = await getOSRMRoute(driverLocation, currentRide.dropoffLocation);
      if (routeData) {
        setRoute(routeData.coordinates);
        setNavigationSteps(routeData.steps);
      }
      setRouteProgress(0);
      setCurrentStepIndex(0);
      setIsNavigationMode(true);
      setAppState('EN_ROUTE_DROPOFF');
      setIsChatOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const finishRide = () => {
    if (currentRide) {
      setEarningsToday(prev => prev + currentRide.estimatedPrice);
    }
    setCurrentRide(null);
    setRoute(null);
    setNavigationSteps([]);
    setAppState('ONLINE');
  };

  const renderTurnIcon = (modifier?: string) => {
    if (!modifier) return <ArrowUp className="h-8 w-8 text-white" />;
    if (modifier.includes('right')) return <ArrowUpRight className="h-8 w-8 text-white" />;
    if (modifier.includes('left')) return <ArrowUpLeft className="h-8 w-8 text-white" />;
    return <ArrowUp className="h-8 w-8 text-white" />;
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentRide) return;
    const msg = { sender: 'driver', text: newMessage, timestamp: Date.now() };
    setNewMessage('');
    try {
      await updateDoc(doc(db, 'rides', currentRide.id), {
        messages: arrayUnion(msg)
      });
    } catch (e) {
      console.error("Error sending message:", e);
    }
  };

  return (
    <div className="relative h-[100dvh] w-full bg-black overflow-hidden font-sans text-white">
      {/* Map Layer */}
      <div className="absolute inset-0 z-0">
        <MapComponent 
          driverLocation={driverLocation} 
          pickupLocation={currentRide?.pickupLocation}
          dropoffLocation={currentRide?.dropoffLocation}
          route={route}
          navigationMode={isNavigationMode}
        />
        {/* Vignette effect for technological feel */}
        <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] z-10" />
      </div>

      {/* Navigation Top Bar (Turn-by-Turn) */}
      <AnimatePresence>
        {isNavigationMode && navigationSteps.length > 0 && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute top-0 left-0 right-0 z-30 p-4 pointer-events-none"
          >
            <Card className="border-0 shadow-[0_10px_30px_rgba(0,0,0,0.5)] rounded-2xl overflow-hidden bg-green-600 text-white">
              <div className="p-4 flex items-center gap-4">
                <div className="bg-black/20 p-2 rounded-xl">
                  {renderTurnIcon(navigationSteps[currentStepIndex]?.modifier)}
                </div>
                <div className="flex-1">
                  <p className="text-3xl font-bold leading-none mb-1">
                    {Math.round(navigationSteps[currentStepIndex]?.distance || 0)} m
                  </p>
                  <p className="text-lg font-medium text-green-50 truncate">
                    {navigationSteps[currentStepIndex]?.instruction}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Traffic Alert Overlay */}
      <AnimatePresence>
        {trafficAlert && (
          <motion.div
            initial={{ y: -50, opacity: 0, scale: 0.9 }}
            animate={{ y: isNavigationMode ? 120 : 20, opacity: 1, scale: 1 }}
            exit={{ y: -50, opacity: 0, scale: 0.9 }}
            className="absolute left-4 right-4 z-40 pointer-events-none"
          >
            <div className="bg-orange-500 text-white p-3 rounded-xl shadow-lg flex items-center gap-3 border border-orange-400">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm font-medium">{trafficAlert}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar (Hidden when in Navigation Mode) */}
      <AnimatePresence>
        {!isNavigationMode && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-start pointer-events-none"
          >
            <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <SheetTrigger render={<Button variant="outline" size="icon" className="rounded-full shadow-lg pointer-events-auto bg-black/50 backdrop-blur-md border-zinc-800 text-white hover:bg-black/70" />}>
                <Menu className="h-5 w-5" />
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] bg-zinc-950 border-zinc-800 text-white p-0 flex flex-col">
                <div className="p-6 bg-zinc-900 border-b border-zinc-800">
                  <div className="flex items-center gap-4 mb-6">
                    <Avatar className="h-16 w-16 border-2 border-zinc-700">
                      <AvatarImage src="https://i.pravatar.cc/150?u=driver" />
                      <AvatarFallback>DR</AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="text-xl font-bold">Roberto J.</h2>
                      <div className="flex items-center gap-1 text-yellow-500 text-sm font-medium">
                        ★ 4.98 <span className="text-zinc-500 font-normal">(1.2k viagens)</span>
                      </div>
                    </div>
                  </div>
                  <Card className="bg-black border-zinc-800">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-zinc-400 uppercase font-semibold">Saldo Disponível</p>
                        <p className="text-2xl font-bold text-green-400">R$ {earningsToday.toFixed(2)}</p>
                      </div>
                      <Button size="sm" className="bg-white text-black hover:bg-gray-200 rounded-full" onClick={() => showToast('Abrindo opções de saque...')}>Sacar</Button>
                    </CardContent>
                  </Card>
                </div>
                
                <div className="flex-1 overflow-y-auto py-4">
                  <div className="px-4 space-y-1">
                    <Button variant="ghost" className="w-full justify-start text-zinc-300 hover:text-white hover:bg-zinc-900 h-12" onClick={() => { setIsMenuOpen(false); setIsProfileOpen(true); }}>
                      <User className="mr-3 h-5 w-5" /> Meu Perfil
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-zinc-300 hover:text-white hover:bg-zinc-900 h-12" onClick={() => { setIsMenuOpen(false); setIsWalletOpen(true); }}>
                      <Wallet className="mr-3 h-5 w-5" /> Carteira e Ganhos
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-zinc-300 hover:text-white hover:bg-zinc-900 h-12" onClick={() => { setIsMenuOpen(false); setIsHistoryOpen(true); }}>
                      <History className="mr-3 h-5 w-5" /> Histórico de Corridas
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-zinc-300 hover:text-white hover:bg-zinc-900 h-12" onClick={() => { setIsMenuOpen(false); setIsSettingsOpen(true); }}>
                      <Settings className="mr-3 h-5 w-5" /> Configurações
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-zinc-300 hover:text-white hover:bg-zinc-900 h-12" onClick={() => showToast('Abrindo detalhes do Veículo...')}>
                      <Car className="mr-3 h-5 w-5" /> Veículo (ABC-1234)
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-zinc-300 hover:text-white hover:bg-zinc-900 h-12" onClick={() => showToast('Abrindo Configurações...')}>
                      <Settings className="mr-3 h-5 w-5" /> Configurações
                    </Button>
                  </div>
                </div>
                
                <div className="p-4 border-t border-zinc-800 space-y-2">
                  <Button variant="ghost" className="w-full justify-start text-zinc-400 hover:text-white hover:bg-zinc-900 h-12" onClick={() => navigate('/')}>
                    <Home className="mr-3 h-5 w-5" /> Voltar ao Início
                  </Button>
                  <Button variant="ghost" className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-950/30 h-12" onClick={() => showToast('Saindo da conta...')}>
                    <Power className="mr-3 h-5 w-5" /> Sair da Conta
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            
            <Card className="pointer-events-auto shadow-lg border border-zinc-800 bg-black/60 backdrop-blur-md rounded-full px-5 py-2.5 flex items-center gap-3">
              <div className="bg-green-500/20 p-1.5 rounded-full">
                <DollarSign className="h-4 w-4 text-green-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold leading-none">Ganhos Hoje</span>
                <span className="font-bold text-lg leading-none mt-1">R$ {earningsToday.toFixed(2)}</span>
              </div>
            </Card>

            <Avatar className="pointer-events-auto shadow-lg border-2 border-zinc-800 ring-2 ring-black">
              <AvatarImage src="https://i.pravatar.cc/150?u=driver" />
              <AvatarFallback className="bg-zinc-800 text-zinc-300">DR</AvatarFallback>
            </Avatar>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Overlay */}
      <AnimatePresence>
        {isProfileOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 bg-zinc-950 flex flex-col pointer-events-auto"
          >
            <div className="p-4 pt-12 bg-zinc-900 border-b border-zinc-800 flex items-center gap-4">
              <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:text-white" onClick={() => setIsProfileOpen(false)}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <h2 className="text-xl font-bold text-white">Meu Perfil</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-col items-center mt-6 mb-8">
                <div className="relative">
                  <Avatar className="h-28 w-28 border-4 border-zinc-800">
                    <AvatarImage src="https://i.pravatar.cc/150?u=driver" />
                    <AvatarFallback>DR</AvatarFallback>
                  </Avatar>
                  <button className="absolute bottom-0 right-0 bg-blue-600 p-2 rounded-full border-2 border-zinc-950 text-white hover:bg-blue-500 transition-colors">
                    <Edit2 className="h-4 w-4" />
                  </button>
                </div>
                
                {isEditingName ? (
                  <div className="mt-4 flex items-center gap-2">
                    <input 
                      type="text" 
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-center font-bold text-xl w-48 focus:outline-none focus:border-blue-500"
                      autoFocus
                    />
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white" onClick={() => setIsEditingName(false)}>Salvar</Button>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-2">
                    <h3 className="text-2xl font-bold text-white">{profileName}</h3>
                    <button onClick={() => setIsEditingName(true)} className="text-zinc-400 hover:text-white">
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
                
                <div className="flex items-center gap-1 text-yellow-500 mt-2 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
                  <Star className="h-4 w-4 fill-yellow-500" />
                  <span className="font-bold">4.98</span>
                  <span className="text-zinc-500 text-sm ml-1">(1.2k avaliações)</span>
                </div>
              </div>

              <div className="space-y-4">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-zinc-300">
                        <Car className="h-5 w-5 text-zinc-500" />
                        <div>
                          <p className="text-white font-medium">Chevrolet Onix Prata</p>
                          <p className="text-sm text-zinc-500">ABC-1234</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300" onClick={() => showToast('Editando veículo...')}>Editar</Button>
                    </div>
                    <Separator className="bg-zinc-800" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-zinc-300">
                        <Phone className="h-5 w-5 text-zinc-500" />
                        <div>
                          <p className="text-white font-medium">+55 11 99999-9999</p>
                          <p className="text-sm text-zinc-500">Telefone verificado</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wallet Overlay */}
      <AnimatePresence>
        {isWalletOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 bg-zinc-950 flex flex-col pointer-events-auto"
          >
            <div className="p-4 pt-12 bg-zinc-900 border-b border-zinc-800 flex items-center gap-4">
              <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:text-white" onClick={() => setIsWalletOpen(false)}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <h2 className="text-xl font-bold text-white">Carteira e Ganhos</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              <Card className="bg-gradient-to-br from-green-900/40 to-zinc-900 border-green-900/50 mb-6">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 text-green-400 mb-2">
                    <Wallet className="h-5 w-5" />
                    <span className="font-medium">Saldo Disponível</span>
                  </div>
                  <h3 className="text-4xl font-bold text-white mb-4">
                    <span className="text-2xl text-zinc-400 mr-1">R$</span>
                    {earningsToday.toFixed(2)}
                  </h3>
                  <Button className="w-full bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl h-12">
                    Transferir para Conta
                  </Button>
                </CardContent>
              </Card>

              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-400" />
                Ganhos da Semana
              </h3>
              
              <Card className="bg-zinc-900 border-zinc-800 mb-6">
                <CardContent className="p-4 pt-6 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyEarnings}>
                      <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        cursor={{ fill: '#27272a' }}
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff' }}
                        itemStyle={{ color: '#4ade80', fontWeight: 'bold' }}
                        formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Ganhos']}
                      />
                      <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                        {weeklyEarnings.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === weeklyEarnings.length - 1 ? '#4ade80' : '#3f3f46'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <h3 className="text-lg font-bold text-white mb-2">Transações Recentes</h3>
                {rideHistory.slice(0, 3).map((ride) => (
                  <div key={ride.id} className="flex items-center justify-between p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                        <Car className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-white font-medium">Corrida concluída</p>
                        <p className="text-xs text-zinc-500">{new Date(ride.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                    <span className="font-bold text-green-400">+ R$ {(ride.price * 0.8).toFixed(2)}</span>
                  </div>
                ))}
                {rideHistory.length === 0 && (
                  <p className="text-zinc-500 text-center py-4">Nenhuma transação recente.</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Overlay */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 bg-zinc-950 flex flex-col pointer-events-auto"
          >
            <div className="p-4 pt-12 bg-zinc-900 border-b border-zinc-800 flex items-center gap-4">
              <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:text-white" onClick={() => setIsSettingsOpen(false)}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <h2 className="text-xl font-bold text-white">Configurações</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-2">Preferências de Direção</h3>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                      <span className="text-white">Navegação por Voz</span>
                      <div className="w-12 h-6 bg-blue-600 rounded-full relative cursor-pointer">
                        <div className="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 shadow-sm"></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                      <span className="text-white">Aceitar corridas automaticamente</span>
                      <div className="w-12 h-6 bg-zinc-700 rounded-full relative cursor-pointer">
                        <div className="w-5 h-5 bg-white rounded-full absolute left-0.5 top-0.5 shadow-sm"></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <span className="text-white">App de Navegação Padrão</span>
                      <span className="text-zinc-400">Interno</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-2">Privacidade e Segurança</h3>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between p-4 border-b border-zinc-800 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                      <span className="text-white">Gravação de Áudio</span>
                      <span className="text-zinc-400">Desativado</span>
                    </div>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                      <span className="text-white">Verificação em Duas Etapas</span>
                      <span className="text-green-400">Ativado</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="pt-4">
                <Button variant="outline" className="w-full border-red-900/50 text-red-400 hover:bg-red-950/30 hover:text-red-300 h-12" onClick={() => showToast('Saindo da conta...')}>
                  Sair da Conta
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Overlay */}
      <AnimatePresence>
        {isHistoryOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 bg-zinc-950 flex flex-col pointer-events-auto"
          >
            <div className="p-4 pt-12 bg-zinc-900 border-b border-zinc-800 flex items-center gap-4">
              <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:text-white" onClick={() => setIsHistoryOpen(false)}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <h2 className="text-xl font-bold text-white">Histórico de Corridas</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingHistory ? (
                <div className="flex justify-center items-center h-40">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              ) : rideHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
                  <History className="h-12 w-12 mb-4 opacity-50" />
                  <p>Você ainda não fez nenhuma corrida.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {rideHistory.map((ride) => (
                    <Card key={ride.id} className="bg-zinc-900 border-zinc-800">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-bold text-white">{new Date(ride.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                            <p className="text-sm text-zinc-400">{ride.passengerName}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-400">R$ {(ride.price * 0.8).toFixed(2)}</p>
                            <p className="text-xs text-zinc-500">Ganhos</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-zinc-300">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            <span className="truncate">{ride.pickupName}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-zinc-300">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <span className="truncate">{ride.dropoffName}</span>
                          </div>
                        </div>
                        {ride.passengerRating && (
                          <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-1">
                            <span className="text-xs text-zinc-500 mr-1">Avaliação do passageiro:</span>
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className={`h-3 w-3 ${i < ride.passengerRating ? 'text-yellow-500 fill-yellow-500' : 'text-zinc-700'}`} />
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Overlay */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="absolute top-4 left-4 right-4 z-[100] pointer-events-none flex justify-center"
          >
            <div className="bg-zinc-800 text-white px-6 py-3 rounded-full shadow-2xl border border-zinc-700 font-medium">
              {toastMessage}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isChatOpen && currentRide && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 bg-zinc-950 flex flex-col pointer-events-auto"
          >
            <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border border-zinc-700">
                  <AvatarFallback className="bg-zinc-800 text-white">{currentRide.passengerName[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-bold">{currentRide.passengerName}</h3>
                  <p className="text-xs text-green-400">Aguardando embarque</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="rounded-full border-zinc-700 bg-zinc-800 text-white hover:bg-zinc-700" onClick={() => showToast('Ligando para o passageiro...')}>
                  <Phone className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:text-white" onClick={() => setIsChatOpen(false)}>
                  <X className="h-6 w-6" />
                </Button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.sender === 'driver' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl ${msg.sender === 'driver' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-zinc-800 text-zinc-100 rounded-tl-sm'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-4 border-t border-zinc-800 bg-zinc-900 flex gap-2">
              <input 
                type="text" 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Digite uma mensagem..." 
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              />
              <Button size="icon" className="rounded-full bg-blue-600 hover:bg-blue-700 text-white" onClick={sendMessage}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom UI Overlays */}
      <div className="absolute inset-0 z-20 p-4 pointer-events-none flex flex-col justify-end">
        <AnimatePresence mode="wait">
          
          {/* OFFLINE / ONLINE STATE */}
          {(appState === 'OFFLINE' || appState === 'ONLINE') && (
            <motion.div
              key="status-panel"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="pointer-events-auto"
            >
              <Card className="border border-zinc-800 shadow-2xl rounded-[32px] overflow-hidden bg-black/80 backdrop-blur-xl">
                <CardContent className="p-6 flex flex-col items-center text-center gap-4">
                  <div className="w-12 h-1.5 bg-zinc-800 rounded-full mb-2" />
                  
                  <div className="relative">
                    {appState === 'ONLINE' && (
                      <div className="absolute inset-0 bg-blue-500 blur-[40px] opacity-20 rounded-full" />
                    )}
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center border-4 relative z-10 transition-colors duration-500 ${appState === 'OFFLINE' ? 'border-zinc-800 bg-zinc-900' : 'border-blue-500/30 bg-blue-500/10'}`}>
                      <Power className={`h-8 w-8 ${appState === 'OFFLINE' ? 'text-zinc-500' : 'text-blue-400'}`} />
                    </div>
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">
                      {appState === 'OFFLINE' ? 'Você está offline' : 'Procurando corridas'}
                    </h2>
                    <p className="text-zinc-400 text-sm mt-1">
                      {appState === 'OFFLINE' ? 'Fique online para começar a receber chamadas.' : 'Analisando demanda na sua região...'}
                    </p>
                  </div>
                  
                  <Button 
                    size="lg" 
                    className={`w-full rounded-full h-14 text-lg font-semibold transition-all mt-2 border-0 ${
                      appState === 'OFFLINE' 
                        ? 'bg-white text-black hover:bg-gray-200' 
                        : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                    }`}
                    onClick={toggleOnline}
                  >
                    {appState === 'OFFLINE' ? 'INICIAR SESSÃO' : 'FICAR OFFLINE'}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* RIDE REQUEST STATE */}
          {appState === 'REQUEST' && currentRide && (
            <motion.div
              key="request-panel"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="pointer-events-auto"
            >
              <Card className="border border-zinc-800 shadow-2xl rounded-[32px] overflow-hidden bg-black/90 backdrop-blur-xl text-white">
                <div className="bg-blue-600/20 border-b border-blue-500/30 p-4 flex items-center justify-center gap-2">
                  <BellRing className="h-5 w-5 text-blue-400 animate-pulse" />
                  <span className="font-bold uppercase tracking-wider text-sm text-blue-400">Nova Solicitação</span>
                </div>
                <CardContent className="p-6 flex flex-col gap-6">
                  <div className="flex justify-between items-center bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                    <div>
                      <p className="text-zinc-400 text-xs uppercase tracking-wider font-semibold mb-1">Ganhos (80%)</p>
                      <p className="text-4xl font-bold text-green-400">R$ {currentRide.estimatedPrice.toFixed(2)}</p>
                      <p className="text-xs text-zinc-500 mt-1">Total: R$ {(currentRide.estimatedPrice / 0.8).toFixed(2)}</p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="bg-zinc-800 px-3 py-1.5 rounded-lg mb-2">
                        <p className="text-sm font-mono text-zinc-300">{currentRide.time} min</p>
                      </div>
                      <p className="text-xl font-semibold">{currentRide.distance.toFixed(1)} km</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-5 relative">
                    <div className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-zinc-800" />
                    <div className="flex items-start gap-4 relative z-10">
                      <div className="mt-1 w-6 h-6 rounded-full bg-zinc-900 border-2 border-green-500 flex items-center justify-center shadow-[0_0_10px_rgba(34,197,94,0.3)]">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                      </div>
                      <div>
                        <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Embarque</p>
                        <p className="font-medium text-lg">{currentRide.pickupName}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4 relative z-10">
                      <div className="mt-1 w-6 h-6 rounded-full bg-zinc-900 border-2 border-red-500 flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.3)]">
                        <div className="w-2 h-2 bg-red-500 rounded-full" />
                      </div>
                      <div>
                        <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Desembarque</p>
                        <p className="font-medium text-lg">{currentRide.dropoffName}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-zinc-900/80 border border-zinc-800 p-3 rounded-2xl">
                    <Avatar className="h-12 w-12 border border-zinc-700">
                      <AvatarFallback className="bg-zinc-800 text-white">{currentRide.passengerName[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium text-lg">{currentRide.passengerName}</p>
                      <div className="flex items-center gap-1 text-sm text-yellow-500 font-medium">
                        ★ {currentRide.passengerRating}
                      </div>
                    </div>
                    <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/10">Premium</Badge>
                  </div>

                  <div className="flex gap-3 mt-2">
                    <Button 
                      variant="outline" 
                      size="lg" 
                      className="flex-1 rounded-full h-14 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                      onClick={declineRide}
                    >
                      <X className="mr-2 h-5 w-5" />
                      Recusar
                    </Button>
                    <Button 
                      size="lg" 
                      className="flex-[2] rounded-full h-14 bg-white hover:bg-gray-200 text-black font-bold text-lg"
                      onClick={acceptRide}
                    >
                      Aceitar Corrida
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* EN ROUTE PICKUP STATE */}
          {appState === 'EN_ROUTE_PICKUP' && currentRide && (
            <motion.div
              key="pickup-panel"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="pointer-events-auto"
            >
              <Card className="border border-zinc-800 shadow-2xl rounded-[32px] overflow-hidden bg-black/90 backdrop-blur-xl">
                <div className="bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-500/20 p-2 rounded-full">
                      <Navigation className="h-5 w-5 text-blue-400" />
                    </div>
                    <span className="font-bold text-white">Buscando passageiro</span>
                  </div>
                  <div className="bg-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-700">
                    <span className="font-mono text-white font-medium">
                      {Math.max(1, currentRide.time - Math.floor(routeProgress / 2))} min
                    </span>
                  </div>
                </div>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-6 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                    <Avatar className="h-12 w-12 border border-zinc-700">
                      <AvatarFallback className="bg-zinc-800 text-white">{currentRide.passengerName[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-bold text-lg text-white">{currentRide.passengerName}</p>
                      <p className="text-zinc-400 text-sm">Aguardando em: <span className="text-white">{currentRide.pickupName}</span></p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="icon" className="rounded-full border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700 text-white relative" onClick={() => setIsChatOpen(true)}>
                        <MessageCircle className="h-5 w-5" />
                        {chatMessages.length > 0 && (
                          <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full border-2 border-zinc-800"></span>
                        )}
                      </Button>
                      <Button variant="outline" size="icon" className="rounded-full border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700 text-white" onClick={() => showToast('Ligando para o passageiro...')}>
                        <Phone className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      className="flex-1 rounded-full h-14 border-red-900/50 text-red-400 bg-red-950/20 hover:bg-red-900/40 hover:text-red-300 font-bold"
                      onClick={async () => {
                        if (currentRide) {
                          await updateDoc(doc(db, 'rides', currentRide.id), { status: 'CANCELLED' });
                        }
                        setAppState('ONLINE');
                        setCurrentRide(null);
                        setRoute(null);
                        setNavigationSteps([]);
                        setIsNavigationMode(false);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button 
                      size="lg" 
                      className="flex-[2] rounded-full h-14 bg-white hover:bg-gray-200 text-black font-bold text-lg"
                      onClick={async () => {
                        setAppState('ARRIVED');
                        setIsNavigationMode(false);
                        if (currentRide) {
                          try {
                            await updateDoc(doc(db, 'rides', currentRide.id), { status: 'ARRIVED' });
                          } catch (e) {
                            console.error(e);
                          }
                        }
                      }}
                    >
                      Cheguei ao local
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ARRIVED STATE */}
          {appState === 'ARRIVED' && currentRide && (
            <motion.div
              key="arrived-panel"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="pointer-events-auto"
            >
              <Card className="border border-zinc-800 shadow-2xl rounded-[32px] overflow-hidden bg-black/90 backdrop-blur-xl">
                <div className="bg-green-500/20 border-b border-green-500/30 text-green-400 p-4 flex items-center justify-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-bold uppercase tracking-wider text-sm">Passageiro notificado</span>
                </div>
                <CardContent className="p-8 text-center">
                  <div className="relative inline-block mb-4">
                    <div className="absolute inset-0 bg-green-500 blur-[30px] opacity-20 rounded-full" />
                    <Avatar className="w-24 h-24 mx-auto border-4 border-zinc-800 relative z-10">
                      <AvatarFallback className="text-3xl bg-zinc-900 text-white">{currentRide.passengerName[0]}</AvatarFallback>
                    </Avatar>
                  </div>
                  <h3 className="text-3xl font-bold mb-2 text-white">{currentRide.passengerName}</h3>
                  <p className="text-zinc-400 mb-8 text-lg">Aguardando embarque...</p>
                  
                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      className="flex-1 rounded-full h-14 border-red-900/50 text-red-400 bg-red-950/20 hover:bg-red-900/40 hover:text-red-300 font-bold"
                      onClick={async () => {
                        if (currentRide) {
                          await updateDoc(doc(db, 'rides', currentRide.id), { status: 'CANCELLED' });
                        }
                        setAppState('ONLINE');
                        setCurrentRide(null);
                        setRoute(null);
                        setNavigationSteps([]);
                        setIsNavigationMode(false);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button 
                      size="lg" 
                      className="flex-[2] rounded-full h-14 bg-green-500 hover:bg-green-600 text-black font-bold text-lg shadow-[0_0_20px_rgba(34,197,94,0.3)]"
                      onClick={startRide}
                    >
                      Iniciar Corrida
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* EN ROUTE DROPOFF STATE */}
          {appState === 'EN_ROUTE_DROPOFF' && currentRide && (
            <motion.div
              key="dropoff-panel"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="pointer-events-auto"
            >
              <Card className="border border-zinc-800 shadow-2xl rounded-[32px] overflow-hidden bg-black/90 backdrop-blur-xl">
                <div className="bg-blue-600/20 border-b border-blue-500/30 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-500/20 p-2 rounded-full">
                      <Navigation className="h-5 w-5 text-blue-400" />
                    </div>
                    <span className="font-bold text-white">A caminho do destino</span>
                  </div>
                  <div className="bg-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-700">
                    <span className="font-mono text-white font-medium">
                      {Math.max(1, currentRide.time - Math.floor(routeProgress / 2))} min
                    </span>
                  </div>
                </div>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4 mb-6 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                    <div className="mt-1 w-6 h-6 rounded-full bg-zinc-900 border-2 border-red-500 flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.3)] flex-shrink-0">
                      <div className="w-2 h-2 bg-red-500 rounded-full" />
                    </div>
                    <div>
                      <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-1">Destino final</p>
                      <h3 className="text-xl font-bold leading-tight text-white">{currentRide.dropoffName}</h3>
                    </div>
                  </div>
                  
                  <Button 
                    size="lg" 
                    className="w-full rounded-full h-14 bg-white hover:bg-gray-200 text-black font-bold text-lg"
                    onClick={async () => {
                      setAppState('COMPLETED');
                      setIsNavigationMode(false);
                      if (currentRide) {
                        try {
                          await updateDoc(doc(db, 'rides', currentRide.id), { status: 'COMPLETED' });
                        } catch (e) {
                          console.error(e);
                        }
                      }
                    }}
                  >
                    Finalizar Corrida
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* COMPLETED STATE */}
          {appState === 'COMPLETED' && currentRide && (
            <motion.div
              key="completed-panel"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="pointer-events-auto absolute inset-4 flex items-center justify-center"
            >
              <Card className="w-full max-w-sm border border-zinc-800 shadow-2xl rounded-[32px] overflow-hidden bg-black/95 backdrop-blur-xl">
                <div className="bg-green-500/10 border-b border-green-500/20 p-8 flex flex-col items-center justify-center text-white relative overflow-hidden">
                  <div className="absolute inset-0 bg-green-500 blur-[60px] opacity-20" />
                  <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-4 border border-green-500/30 relative z-10">
                    <CheckCircle className="h-10 w-10 text-green-400" />
                  </div>
                  <h2 className="text-3xl font-bold mb-1 relative z-10">Corrida Concluída!</h2>
                  <p className="text-green-400 relative z-10">Excelente trabalho.</p>
                </div>
                <CardContent className="p-8 text-center">
                  <div className="bg-zinc-900/50 p-6 rounded-3xl border border-zinc-800 mb-8">
                    <p className="text-zinc-400 uppercase tracking-wider text-xs font-semibold mb-2">Seus Ganhos (80%)</p>
                    <p className="text-5xl font-bold text-green-400">
                      <span className="text-2xl text-green-400/60 align-top mr-1">R$</span>
                      {(currentRide.estimatedPrice * 0.8).toFixed(2)}
                    </p>
                    <Separator className="my-4 bg-zinc-800" />
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">Valor total pago</span>
                      <span className="text-zinc-300">R$ {currentRide.estimatedPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-zinc-500">Taxa do app (20%)</span>
                      <span className="text-zinc-300">- R$ {(currentRide.estimatedPrice * 0.2).toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <Button 
                    size="lg" 
                    className="w-full rounded-full h-14 bg-white hover:bg-gray-200 text-black font-bold text-lg"
                    onClick={finishRide}
                  >
                    Continuar Online
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

