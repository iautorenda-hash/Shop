import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, Search, MapPin, Home, User, Clock, ArrowLeft, Car, CreditCard, Star, Phone, MessageCircle, ShieldCheck, Edit2, Settings } from 'lucide-react';
import MapComponent from './components/MapComponent';
import { getOSRMRoute, RouteData } from './lib/routing';
import { searchPlaces, PlaceResult } from './lib/geocoding';
import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from './components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from "./components/ui/sheet";
import { Separator } from './components/ui/separator';
import { db, auth } from './firebase';
import { collection, addDoc, onSnapshot, doc, updateDoc, arrayUnion, query, where, orderBy, getDocs } from 'firebase/firestore';

const INITIAL_LOCATION: [number, number] = [-23.5505, -46.6333]; // São Paulo
const DESTINATION_LOCATION: [number, number] = [-23.5874, -46.6576]; // Parque Ibirapuera

type PassengerState = 'IDLE' | 'SEARCHING' | 'SELECTING_RIDE' | 'REQUESTING' | 'WAITING_DRIVER' | 'EN_ROUTE_DROPOFF' | 'COMPLETED';

export default function PassengerApp() {
  const navigate = useNavigate();
  const [appState, setAppState] = useState<PassengerState>('IDLE');
  const [userLocation, setUserLocation] = useState<[number, number]>(INITIAL_LOCATION);
  const [driverLocation, setDriverLocation] = useState<[number, number] | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{sender: 'driver'|'passenger', text: string}[]>([]);
  const [newMessage, setNewMessage] = useState('');
  
  const [destinationQuery, setDestinationQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [selectedDestName, setSelectedDestName] = useState('');
  const [destinationLocation, setDestinationLocation] = useState<[number, number] | null>(null);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'economy' | 'premium'>('economy');
  
  const [currentRideId, setCurrentRideId] = useState<string | null>(null);
  const [driverInfo, setDriverInfo] = useState<{name: string} | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  const [rating, setRating] = useState(0);

  const economyPrice = routeData ? ((routeData.distance / 1000) * 2.5 + 5) : 25.00;
  const premiumPrice = routeData ? ((routeData.distance / 1000) * 4 + 8) : 38.50;

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [rideHistory, setRideHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [profileName, setProfileName] = useState('Carlos S.');
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.error("Error getting location:", error);
          // Fallback to INITIAL_LOCATION is already set
        },
        { enableHighAccuracy: true }
      );
    }
  }, []);

  const loadHistory = async () => {
    if (!auth.currentUser) return;
    setIsLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'rides'),
        where('passengerId', '==', auth.currentUser.uid),
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

  useEffect(() => {
    if (!currentRideId) return;

    const unsubscribe = onSnapshot(doc(db, 'rides', currentRideId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        
        if (data.driverLocation) {
          setDriverLocation(data.driverLocation);
        }
        if (data.messages) {
          setChatMessages(data.messages);
        }

        if (data.status === 'EN_ROUTE_PICKUP' || data.status === 'WAITING_DRIVER') {
          setAppState('WAITING_DRIVER');
          setDriverInfo({ name: data.driverName || 'Motorista' });
        } else if (data.status === 'ARRIVED') {
          // Could show a notification "Motorista chegou"
        } else if (data.status === 'EN_ROUTE_DROPOFF') {
          setAppState('EN_ROUTE_DROPOFF');
        } else if (data.status === 'COMPLETED') {
          setAppState('COMPLETED');
        } else if (data.status === 'CANCELLED') {
          cancelRide();
          showToast('A corrida foi cancelada.');
        }
      }
    });

    return () => unsubscribe();
  }, [currentRideId]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (destinationQuery.length >= 3) {
        setIsSearchingPlaces(true);
        const results = await searchPlaces(destinationQuery);
        setSearchResults(results);
        setIsSearchingPlaces(false);
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [destinationQuery]);

  const handleSelectDestination = async (name: string, lat?: string, lon?: string) => {
    setSelectedDestName(name);
    setIsLoadingRoute(true);
    try {
      const destCoords: [number, number] = lat && lon ? [parseFloat(lat), parseFloat(lon)] : DESTINATION_LOCATION;
      setDestinationLocation(destCoords);
      const route = await getOSRMRoute(userLocation, destCoords);
      if (route) {
        setRouteData(route);
        setAppState('SELECTING_RIDE');
      } else {
        showToast("Não foi possível traçar a rota. Tente novamente.");
      }
    } catch (error) {
      console.error("Route error:", error);
      showToast("Erro ao buscar rota.");
    } finally {
      setIsLoadingRoute(false);
    }
  };

  const [isRequestingRide, setIsRequestingRide] = useState(false);

  const handleRequestRide = async () => {
    if (!auth.currentUser) {
      showToast("Você precisa estar logado para pedir uma corrida.");
      return;
    }
    setIsRequestingRide(true);
    
    try {
      const docRef = await addDoc(collection(db, 'rides'), {
        passengerId: auth.currentUser.uid,
        passengerName: auth.currentUser.displayName || 'Passageiro',
        status: 'REQUESTING',
        pickupLocation: userLocation,
        dropoffLocation: destinationLocation || DESTINATION_LOCATION,
        pickupName: 'Localização Atual',
        dropoffName: selectedDestName,
        category: selectedCategory,
        price: selectedCategory === 'economy' ? economyPrice : premiumPrice,
        distance: routeData ? (routeData.distance / 1000) : 4.2,
        time: routeData ? Math.round(routeData.duration / 60) : 12,
        createdAt: Date.now()
      });
      setCurrentRideId(docRef.id);
      setAppState('REQUESTING');
    } catch (error) {
      console.error("Error requesting ride:", error);
      showToast("Erro ao solicitar corrida.");
    } finally {
      setIsRequestingRide(false);
    }
  };

  const cancelRide = async () => {
    if (currentRideId) {
      try {
        await updateDoc(doc(db, 'rides', currentRideId), { status: 'CANCELLED' });
      } catch (e) {
        console.error(e);
      }
    }
    setAppState('IDLE');
    setRouteData(null);
    setDriverLocation(null);
    setSelectedDestName('');
    setCurrentRideId(null);
    setDriverInfo(null);
  };

  const submitRating = async () => {
    if (currentRideId) {
      try {
        await updateDoc(doc(db, 'rides', currentRideId), { passengerRating: rating });
      } catch (e) {
        console.error("Error submitting rating:", e);
      }
    }
    showToast("Obrigado pela avaliação!");
    setAppState('IDLE');
    setRouteData(null);
    setDriverLocation(null);
    setSelectedDestName('');
    setCurrentRideId(null);
    setDriverInfo(null);
    setRating(0);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentRideId) return;
    const msg = { sender: 'passenger', text: newMessage, timestamp: Date.now() };
    setNewMessage('');
    try {
      await updateDoc(doc(db, 'rides', currentRideId), {
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
          driverLocation={driverLocation || userLocation} 
          pickupLocation={appState === 'WAITING_DRIVER' ? userLocation : undefined}
          dropoffLocation={routeData ? (destinationLocation || DESTINATION_LOCATION) : undefined}
          route={routeData?.coordinates}
        />
        <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] z-10" />
      </div>

      {/* Top Bar / Back Button */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-start pointer-events-none">
        <AnimatePresence mode="wait">
          {appState === 'IDLE' ? (
            <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                <SheetTrigger render={<Button variant="outline" size="icon" className="rounded-full shadow-lg pointer-events-auto bg-black/50 backdrop-blur-md border-zinc-800 text-white hover:bg-black/70" />}>
                  <Menu className="h-5 w-5" />
                </SheetTrigger>
                <SheetContent side="left" className="w-[300px] bg-zinc-950 border-zinc-800 text-white p-0 flex flex-col">
                  <div className="p-6 bg-zinc-900 border-b border-zinc-800">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-16 w-16 border-2 border-zinc-700">
                        <AvatarImage src="https://i.pravatar.cc/150?u=passenger" />
                        <AvatarFallback>PA</AvatarFallback>
                      </Avatar>
                      <div>
                        <h2 className="text-xl font-bold">{profileName}</h2>
                        <div className="flex items-center gap-1 text-yellow-500 text-sm font-medium">
                          ★ 4.9
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto py-4">
                    <div className="px-4 space-y-1">
                      <Button variant="ghost" className="w-full justify-start text-zinc-300 hover:text-white hover:bg-zinc-900 h-12" onClick={() => { setIsMenuOpen(false); setIsProfileOpen(true); }}>
                        <User className="mr-3 h-5 w-5" /> Meu Perfil
                      </Button>
                      <Button variant="ghost" className="w-full justify-start text-zinc-300 hover:text-white hover:bg-zinc-900 h-12" onClick={() => { setIsMenuOpen(false); setIsHistoryOpen(true); }}>
                        <Clock className="mr-3 h-5 w-5" /> Minhas Viagens
                      </Button>
                      <Button variant="ghost" className="w-full justify-start text-zinc-300 hover:text-white hover:bg-zinc-900 h-12" onClick={() => { setIsMenuOpen(false); setIsSettingsOpen(true); }}>
                        <Settings className="mr-3 h-5 w-5" /> Configurações
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 border-t border-zinc-800 space-y-2">
                    <Button variant="ghost" className="w-full justify-start text-zinc-400 hover:text-white hover:bg-zinc-900 h-12" onClick={() => navigate('/')}>
                      <Home className="mr-3 h-5 w-5" /> Voltar ao Início
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </motion.div>
          ) : (
            <motion.div key="back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Button 
                variant="outline" 
                size="icon" 
                className="rounded-full shadow-lg pointer-events-auto bg-black/50 backdrop-blur-md border-zinc-800 text-white hover:bg-black/70"
                onClick={cancelRide}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom UI Overlays */}
      <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-end">
        <AnimatePresence mode="wait">
          
          {/* IDLE STATE */}
          {appState === 'IDLE' && (
            <motion.div key="idle" initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="pointer-events-auto p-4">
              <Card className="border border-zinc-800 shadow-2xl rounded-[32px] overflow-hidden bg-black/80 backdrop-blur-xl">
                <CardContent className="p-6 flex flex-col gap-4">
                  <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-2" />
                  <h2 className="text-2xl font-bold tracking-tight text-white mb-2">Para onde vamos?</h2>
                  <div 
                    className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:bg-zinc-800 transition-colors"
                    onClick={() => setAppState('SEARCHING')}
                  >
                    <Search className="text-zinc-400 h-5 w-5" />
                    <span className="text-zinc-400 text-lg font-medium">Buscar destino...</span>
                  </div>
                  <div className="flex gap-3 mt-2">
                    <Button disabled={isLoadingRoute} variant="outline" className="flex-1 rounded-xl h-14 border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-white justify-start px-4" onClick={() => handleSelectDestination('Casa', '-23.5615', '-46.6556')}>
                      <div className="bg-blue-500/20 p-2 rounded-full mr-3"><Home className="h-4 w-4 text-blue-400" /></div>
                      {isLoadingRoute ? 'Buscando...' : 'Casa'}
                    </Button>
                    <Button disabled={isLoadingRoute} variant="outline" className="flex-1 rounded-xl h-14 border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-white justify-start px-4" onClick={() => handleSelectDestination('Trabalho', '-23.5956', '-46.6866')}>
                      <div className="bg-orange-500/20 p-2 rounded-full mr-3"><MapPin className="h-4 w-4 text-orange-400" /></div>
                      {isLoadingRoute ? 'Buscando...' : 'Trabalho'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* SEARCHING STATE */}
          {appState === 'SEARCHING' && (
            <motion.div key="searching" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="pointer-events-auto absolute inset-0 bg-zinc-950 z-50 flex flex-col">
              <div className="p-4 pt-12 bg-zinc-900 border-b border-zinc-800 flex gap-3 items-center">
                <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:text-white" onClick={() => setAppState('IDLE')}>
                  <ArrowLeft className="h-6 w-6" />
                </Button>
                <div className="flex-1 relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full" />
                  <input type="text" value="Localização Atual" disabled className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-4 py-3 text-zinc-400 mb-2 focus:outline-none" />
                  
                  <div className="absolute left-3 top-[70%] w-2 h-2 bg-red-500 rounded-full" />
                  <div className="absolute left-[15px] top-[30%] bottom-[30%] w-[1px] bg-zinc-700" />
                  <input 
                    autoFocus
                    type="text" 
                    placeholder="Para onde?" 
                    value={destinationQuery}
                    onChange={(e) => setDestinationQuery(e.target.value)}
                    className="w-full bg-black border border-zinc-700 rounded-xl pl-8 pr-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors" 
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {isSearchingPlaces ? (
                  <div className="flex justify-center items-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((place, idx) => (
                    <div key={idx} className={`flex items-center gap-4 p-4 hover:bg-zinc-900 rounded-2xl cursor-pointer transition-colors ${isLoadingRoute ? 'opacity-50 pointer-events-none' : ''}`} onClick={() => handleSelectDestination(place.display_name.split(',')[0], place.lat, place.lon)}>
                      <div className="bg-zinc-800 p-3 rounded-full"><MapPin className="h-5 w-5 text-zinc-400" /></div>
                      <div className="flex-1 border-b border-zinc-800 pb-4">
                        <p className="font-bold text-lg">{place.display_name.split(',')[0]}</p>
                        <p className="text-zinc-400 text-sm line-clamp-1">{place.display_name}</p>
                      </div>
                    </div>
                  ))
                ) : destinationQuery.length >= 3 ? (
                  <div className="text-center py-8 text-zinc-500">Nenhum local encontrado.</div>
                ) : (
                  <>
                    <div className={`flex items-center gap-4 p-4 hover:bg-zinc-900 rounded-2xl cursor-pointer transition-colors ${isLoadingRoute ? 'opacity-50 pointer-events-none' : ''}`} onClick={() => handleSelectDestination('Parque Ibirapuera', '-23.5874', '-46.6576')}>
                      <div className="bg-zinc-800 p-3 rounded-full"><MapPin className="h-5 w-5 text-zinc-400" /></div>
                      <div className="flex-1 border-b border-zinc-800 pb-4">
                        <p className="font-bold text-lg">Parque Ibirapuera</p>
                        <p className="text-zinc-400 text-sm">Av. Pedro Álvares Cabral - Vila Mariana</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-4 p-4 hover:bg-zinc-900 rounded-2xl cursor-pointer transition-colors ${isLoadingRoute ? 'opacity-50 pointer-events-none' : ''}`} onClick={() => handleSelectDestination('Aeroporto de Congonhas', '-23.6273', '-46.6566')}>
                      <div className="bg-zinc-800 p-3 rounded-full"><MapPin className="h-5 w-5 text-zinc-400" /></div>
                      <div className="flex-1 border-b border-zinc-800 pb-4">
                        <p className="font-bold text-lg">Aeroporto de Congonhas</p>
                        <p className="text-zinc-400 text-sm">Av. Washington Luís, s/nº - Vila Congonhas</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* SELECTING RIDE STATE */}
          {appState === 'SELECTING_RIDE' && (
            <motion.div key="selecting" initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="pointer-events-auto p-4">
              <Card className="border border-zinc-800 shadow-2xl rounded-[32px] overflow-hidden bg-black/90 backdrop-blur-xl">
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-2" />
                  
                  <div 
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${selectedCategory === 'economy' ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'}`}
                    onClick={() => setSelectedCategory('economy')}
                  >
                    <div className="flex items-center gap-4">
                      <img src="https://cdn-icons-png.flaticon.com/512/3202/3202926.png" alt="Economy" className="w-14 h-14 object-contain invert opacity-90" />
                      <div>
                        <h3 className="font-bold text-lg flex items-center gap-2">Pro X <User className="h-4 w-4 text-zinc-400"/>4</h3>
                        <p className="text-zinc-400 text-sm">3 min • Econômico</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xl">R$ {economyPrice.toFixed(2).replace('.', ',')}</p>
                    </div>
                  </div>

                  <div 
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${selectedCategory === 'premium' ? 'border-purple-500 bg-purple-500/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'}`}
                    onClick={() => setSelectedCategory('premium')}
                  >
                    <div className="flex items-center gap-4">
                      <img src="https://cdn-icons-png.flaticon.com/512/3202/3202926.png" alt="Premium" className="w-14 h-14 object-contain invert" />
                      <div>
                        <h3 className="font-bold text-lg flex items-center gap-2 text-purple-400">Pro Black <User className="h-4 w-4 text-zinc-400"/>4</h3>
                        <p className="text-zinc-400 text-sm">5 min • Conforto extra</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xl">R$ {premiumPrice.toFixed(2).replace('.', ',')}</p>
                    </div>
                  </div>

                  <Separator className="bg-zinc-800 my-2" />
                  
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <CreditCard className="h-5 w-5" />
                      <span className="font-medium">•••• 4321</span>
                    </div>
                    <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300" onClick={() => showToast('Abrindo opções de pagamento...')}>Trocar</Button>
                  </div>

                  <Button 
                    size="lg" 
                    disabled={isRequestingRide}
                    className="w-full rounded-full h-14 bg-white hover:bg-gray-200 text-black font-bold text-lg mt-2"
                    onClick={handleRequestRide}
                  >
                    {isRequestingRide ? 'Solicitando...' : `Confirmar ${selectedCategory === 'economy' ? 'Pro X' : 'Pro Black'}`}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* REQUESTING STATE */}
          {appState === 'REQUESTING' && (
            <motion.div key="requesting" initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="pointer-events-auto p-4">
              <Card className="border border-zinc-800 shadow-2xl rounded-[32px] overflow-hidden bg-black/90 backdrop-blur-xl">
                <CardContent className="p-8 flex flex-col items-center text-center gap-6">
                  <div className="relative w-24 h-24 flex items-center justify-center">
                    <div className="absolute inset-0 border-4 border-blue-500/30 rounded-full animate-ping" />
                    <div className="absolute inset-2 border-4 border-blue-500/60 rounded-full animate-pulse" />
                    <Search className="h-8 w-8 text-blue-400 relative z-10" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">Buscando motorista...</h2>
                    <p className="text-zinc-400 mt-2">Conectando você ao motorista mais próximo.</p>
                  </div>
                  <Button variant="outline" className="rounded-full border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={cancelRide}>
                    Cancelar
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* WAITING DRIVER STATE */}
          {appState === 'WAITING_DRIVER' && (
            <motion.div key="waiting" initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="pointer-events-auto p-4">
              <Card className="border border-zinc-800 shadow-2xl rounded-[32px] overflow-hidden bg-black/90 backdrop-blur-xl">
                <div className="bg-blue-600 p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg leading-none">Motorista a caminho</h3>
                    <p className="text-blue-100 text-sm mt-1">Chega em 3 min</p>
                  </div>
                  <div className="bg-black/20 px-3 py-1 rounded-lg backdrop-blur-sm">
                    <p className="font-mono font-bold text-lg">ABC-1234</p>
                    <p className="text-[10px] text-center text-blue-100 uppercase">Placa</p>
                  </div>
                </div>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-14 w-14 border-2 border-zinc-700">
                        <AvatarImage src="https://i.pravatar.cc/150?u=driver" />
                        <AvatarFallback>DR</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold text-lg">Roberto J.</p>
                        <div className="flex items-center gap-1 text-yellow-500 text-sm">
                          ★ 4.98 <span className="text-zinc-500 font-normal text-xs">• Chevrolet Onix Prata</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Separator className="bg-zinc-800 mb-4" />
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1 rounded-xl h-12 border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700 text-white" onClick={() => setIsChatOpen(true)}>
                      <MessageCircle className="mr-2 h-5 w-5" /> Chat
                    </Button>
                    <Button variant="outline" className="flex-1 rounded-xl h-12 border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700 text-white" onClick={() => showToast('Ligando para Roberto J...')}>
                      <Phone className="mr-2 h-5 w-5" /> Ligar
                    </Button>
                    <Button variant="outline" size="icon" className="rounded-xl h-12 w-12 border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700 text-white" onClick={() => showToast('Central de Segurança acionada.')}>
                      <ShieldCheck className="h-5 w-5 text-blue-400" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* COMPLETED / RATING STATE */}
          {appState === 'COMPLETED' && (
            <motion.div key="completed" initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="pointer-events-auto p-4">
              <Card className="border border-zinc-800 shadow-2xl rounded-[32px] overflow-hidden bg-black/90 backdrop-blur-xl">
                <div className="bg-green-600 p-6 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-3">
                    <ShieldCheck className="h-8 w-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">Você chegou ao destino!</h2>
                </div>
                <CardContent className="p-6 flex flex-col items-center text-center gap-4">
                  <p className="text-zinc-400">Como foi a viagem com {driverInfo?.name || 'o motorista'}?</p>
                  <div className="flex gap-2 my-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-10 w-10 cursor-pointer transition-colors ${rating >= star ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-600'}`}
                        onClick={() => setRating(star)}
                      />
                    ))}
                  </div>
                  <Button
                    size="lg"
                    className="w-full rounded-full h-14 bg-white hover:bg-gray-200 text-black font-bold text-lg mt-2"
                    onClick={submitRating}
                    disabled={rating === 0}
                  >
                    Avaliar e Concluir
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

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
                    <AvatarImage src="https://i.pravatar.cc/150?u=passenger" />
                    <AvatarFallback>PA</AvatarFallback>
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
                  <span className="font-bold">4.9</span>
                </div>
              </div>

              <div className="space-y-4">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-zinc-300">
                        <Phone className="h-5 w-5 text-zinc-500" />
                        <div>
                          <p className="text-white font-medium">+55 11 98888-8888</p>
                          <p className="text-sm text-zinc-500">Telefone verificado</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300" onClick={() => showToast('Editando telefone...')}>Editar</Button>
                    </div>
                    <Separator className="bg-zinc-800" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-zinc-300">
                        <CreditCard className="h-5 w-5 text-zinc-500" />
                        <div>
                          <p className="text-white font-medium">Cartão final 4321</p>
                          <p className="text-sm text-zinc-500">Método principal</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300" onClick={() => showToast('Gerenciando cartões...')}>Gerenciar</Button>
                    </div>
                  </CardContent>
                </Card>
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
                <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-2">Preferências</h3>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                      <span className="text-white">Notificações Push</span>
                      <div className="w-12 h-6 bg-blue-600 rounded-full relative cursor-pointer">
                        <div className="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 shadow-sm"></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                      <span className="text-white">Tema Escuro</span>
                      <div className="w-12 h-6 bg-blue-600 rounded-full relative cursor-pointer">
                        <div className="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 shadow-sm"></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <span className="text-white">Idioma</span>
                      <span className="text-zinc-400">Português (BR)</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-2">Privacidade e Segurança</h3>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between p-4 border-b border-zinc-800 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                      <span className="text-white">Compartilhar localização</span>
                      <span className="text-zinc-400">Durante a viagem</span>
                    </div>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                      <span className="text-white">Contatos de Confiança</span>
                      <span className="text-zinc-400">2 contatos</span>
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
            className="absolute inset-0 z-50 bg-zinc-950 flex flex-col"
          >
            <div className="p-4 pt-12 bg-zinc-900 border-b border-zinc-800 flex items-center gap-4">
              <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:text-white" onClick={() => setIsHistoryOpen(false)}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <h2 className="text-xl font-bold text-white">Minhas Viagens</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingHistory ? (
                <div className="flex justify-center items-center h-40">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              ) : rideHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
                  <Clock className="h-12 w-12 mb-4 opacity-50" />
                  <p>Você ainda não fez nenhuma viagem.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {rideHistory.map((ride) => (
                    <Card key={ride.id} className="bg-zinc-900 border-zinc-800">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-bold text-white">{new Date(ride.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                            <p className="text-sm text-zinc-400">{ride.category === 'economy' ? 'Pro X' : 'Pro Black'}</p>
                          </div>
                          <p className="font-bold text-green-400">R$ {ride.price?.toFixed(2)}</p>
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
                            <span className="text-xs text-zinc-500 mr-1">Sua avaliação:</span>
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
        {isChatOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 bg-zinc-950 flex flex-col"
          >
            <div className="p-4 pt-12 bg-zinc-900 border-b border-zinc-800 flex items-center gap-4">
              <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:text-white" onClick={() => setIsChatOpen(false)}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src="https://i.pravatar.cc/150?u=driver" />
                  <AvatarFallback>DR</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-bold">Roberto J.</h3>
                  <p className="text-xs text-zinc-400">Chevrolet Onix • ABC-1234</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.sender === 'passenger' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl ${msg.sender === 'passenger' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-zinc-800 text-white rounded-tl-sm'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-zinc-900 border-t border-zinc-800">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Mensagem para Roberto..."
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                />
                <Button size="icon" className="rounded-full bg-blue-600 hover:bg-blue-700 h-12 w-12 shrink-0" onClick={sendMessage}>
                  <MessageCircle className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
