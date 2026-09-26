import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged,
  signInWithPopup, 
  GoogleAuthProvider, 
  GithubAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import logo from './logo.png';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

type AccessStatus = 'none' | 'pending' | 'approved' | 'rejected';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('none');
  
  // Estados do formulário de auth
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Estados do Onboarding (Multi-step profile)
  const [step, setStep] = useState(1);
  const [profileData, setProfileData] = useState({
    name: '',
    location: '',
    role: '',
    company: '',
    pitch: '',
    lookingFor: ''
  });

  // 1. Listener de Estado de Autenticação + Firestore Status (Ponto 3)
  useEffect(() => {
    let unsubscribeSnapshot: () => void;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        // Escutar alterações em tempo real no documento accessRequests
        const docRef = doc(db, 'accessRequests', currentUser.uid);
        unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setAccessStatus(data.status as AccessStatus);
          } else {
            setAccessStatus('none'); // Reencaminha para o Onboarding
          }
          setLoading(false);
        }, (err) => {
          console.error("Erro ao escutar Firestore:", err);
          setError("Erro ao carregar dados do perfil.");
          setLoading(false);
        });
      } else {
        if (unsubscribeSnapshot) unsubscribeSnapshot();
        setAccessStatus('none');
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  // Handlers de Auth (Sem alerts — Ponto 1 & 4)
  const handleGoogleLogin = async () => {
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGithubLogin = async () => {
    setError('');
    try {
      const provider = new GithubAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = () => signOut(auth);

  // Submeter pedido de acesso ao concluir o Onboarding
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await setDoc(doc(db, 'accessRequests', user.uid), {
        uid: user.uid,
        email: user.email,
        ...profileData,
        status: 'pending',
        createdAt: serverTimestamp()
      });
    } catch (err: any) {
      setError("Erro ao enviar o pedido de acesso.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center font-sans">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-black"></div>
      </div>
    );
  }

  // 2. Encaminhamento condicional segundo o status do documento (Ponto 2)
  if (user) {
    // 2.d Aprovado -> Feed Principal
    if (accessStatus === 'approved') {
      return (
        <div className="min-h-screen bg-[#f5f5f7] p-8 font-sans">
          <header className="max-w-4xl mx-auto flex justify-between items-center mb-8">
            <img src={logo} alt="Elo" className="h-10 w-auto" />
            <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-black">
              Sair
            </button>
          </header>
          <main className="max-w-4xl mx-auto bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
            <h1 className="text-2xl font-bold mb-4">Feed Elo</h1>
            <p className="text-gray-600">Bem-vindo à rede exclusiva.</p>
          </main>
        </div>
      );
    }

    // 2.c Pendente -> Ecrã de Espera
    if (accessStatus === 'pending') {
      return (
        <div className="min-h-screen bg-[#f5f5f7] flex flex-col justify-center items-center p-6 font-sans text-center">
          <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm max-w-md w-full">
            <img src={logo} alt="Elo" className="mx-auto h-16 w-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Pedido Enviado</h2>
            <p className="text-sm text-gray-500 mb-6">
              O teu perfil está sob análise. Notificar-te-emos assim que o teu acesso for aprovado.
            </p>
            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-black">
              Sair da conta
            </button>
          </div>
        </div>
      );
    }

    // 2.e Rejeitado -> Ecrã de Rejeição
    if (accessStatus === 'rejected') {
      return (
        <div className="min-h-screen bg-[#f5f5f7] flex flex-col justify-center items-center p-6 font-sans text-center">
          <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm max-w-md w-full">
            <img src={logo} alt="Elo" className="mx-auto h-16 w-auto mb-4" />
            <h2 className="text-xl font-semibold text-red-600 mb-2">Acesso Não Aprovado</h2>
            <p className="text-sm text-gray-500 mb-6">
              Lamentamos, mas a tua candidatura ao Elo não foi aceite neste momento.
            </p>
            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-black">
              Sair
            </button>
          </div>
        </div>
      );
    }

    // 2.b Novo utilizador (sem documento) -> Flow de Completação de Perfil Multi-step
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col justify-center items-center p-6 font-sans">
        <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm max-w-md w-full">
          <img src={logo} alt="Elo" className="mx-auto h-16 w-auto mb-4" />
          <div className="mb-6 flex justify-between text-xs text-gray-400 font-medium">
            <span className={step >= 1 ? "text-black" : ""}>1. Dados</span>
            <span className={step >= 2 ? "text-black" : ""}>2. Percurso</span>
            <span className={step >= 3 ? "text-black" : ""}>3. Objetivos</span>
          </div>

          <form onSubmit={step === 3 ? handleProfileSubmit : (e) => { e.preventDefault(); setStep(step + 1); }}>
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-base">Quem és?</h3>
                <input 
                  type="text" 
                  placeholder="Nome Completo" 
                  value={profileData.name} 
                  onChange={(e) => setProfileData({...profileData, name: e.target.value})}
                  required 
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                />
                <input 
                  type="text" 
                  placeholder="Localização (ex: Lisboa, Portugal)" 
                  value={profileData.location} 
                  onChange={(e) => setProfileData({...profileData, location: e.target.value})}
                  required 
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-base">O teu projeto</h3>
                <input 
                  type="text" 
                  placeholder="Cargo / Posição" 
                  value={profileData.role} 
                  onChange={(e) => setProfileData({...profileData, role: e.target.value})}
                  required 
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                />
                <input 
                  type="text" 
                  placeholder="Empresa / Projeto" 
                  value={profileData.company} 
                  onChange={(e) => setProfileData({...profileData, company: e.target.value})}
                  required 
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                />
                <textarea 
                  placeholder="Pitch curto (1-2 frases)" 
                  value={profileData.pitch} 
                  onChange={(e) => setProfileData({...profileData, pitch: e.target.value})}
                  required 
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm h-20"
                />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-base">O que procuras no Elo?</h3>
                <textarea 
                  placeholder="Ex: Mentores, Co-founders, Investimento..." 
                  value={profileData.lookingFor} 
                  onChange={(e) => setProfileData({...profileData, lookingFor: e.target.value})}
                  required 
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm h-28"
                />
              </div>
            )}

            <div className="mt-6 flex justify-between gap-3">
              {step > 1 && (
                <button 
                  type="button" 
                  onClick={() => setStep(step - 1)} 
                  className="w-1/2 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  Voltar
                </button>
              )}
              <button 
                type="submit" 
                className={`py-2.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 ${step === 1 ? 'w-full' : 'w-1/2'}`}
              >
                {step === 3 ? 'Submeter Pedido' : 'Continuar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Formulário Inicial de Entrar / Registar
  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-gray-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <img src={logo} alt="Elo" className="mx-auto h-20 w-auto mb-4" />
        <h2 className="text-2xl font-semibold tracking-tight">
          {isSignUp ? 'Criar a tua conta no Elo' : 'Bem-vindo de volta ao Elo'}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-10 shadow-sm sm:rounded-2xl border border-gray-200">
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <button 
              onClick={handleGoogleLogin}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
              Continuar com Google
            </button>
            
            <button 
              onClick={handleGithubLogin}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg bg-black text-sm font-medium text-white hover:bg-gray-800 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
              Continuar com GitHub
            </button>
          </div>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white text-gray-400">ou email</span>
              </div>
            </div>

            <form onSubmit={handleEmailAuth} className="mt-6 space-y-4">
              <div>
                <input 
                  type="email" 
                  placeholder="Email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="block w-full border border-gray-300 rounded-lg py-2.5 px-3 focus:outline-none focus:ring-1 focus:ring-black focus:border-black text-sm" 
                />
              </div>
              <div>
                <input 
                  type="password" 
                  placeholder="Password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="block w-full border border-gray-300 rounded-lg py-2.5 px-3 focus:outline-none focus:ring-1 focus:ring-black focus:border-black text-sm" 
                />
              </div>
              <button 
                type="submit"
                className="w-full flex justify-center py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-black hover:bg-gray-800 transition-colors"
              >
                {isSignUp ? 'Registar' : 'Entrar'}
              </button>
            </form>
          </div>

          <div className="mt-6 text-center">
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs text-gray-500 hover:text-black transition-colors"
            >
              {isSignUp ? 'Já tens conta? Entrar' : 'Não tens conta? Criar uma'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
