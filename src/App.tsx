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
  updateEmail,
  updatePassword,
  deleteUser,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import logo from './logo.png';

const ADMIN_UID = 'ADMIN_MASTER_UID_ELO';

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

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  location: string;
  role: string;
  company: string;
  pitch: string;
  lookingFor: string;
  avatarUrl?: string;
  coverUrl?: string;
  linkedinUrl?: string;
  visibleInNetwork?: boolean;
  acceptsMeetings?: boolean;
  status: AccessStatus;
  createdAt?: any;
}

interface Post {
  id: string;
  authorUid: string;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  content: string;
  imageUrl?: string;
  timestamp: string;
  likes: string[]; // UIDs de quem deu like
  comments: { id: string; authorName: string; text: string; timestamp: string }[];
}

interface NotificationItem {
  id: string;
  type: 'follow' | 'meeting' | 'like';
  text: string;
  timestamp: string;
  read: boolean;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('none');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Navegação
  const [currentTab, setCurrentTab] = useState<'feed' | 'rede' | 'notificacoes' | 'perfil'>('feed');
  const [activeModal, setActiveModal] = useState<'none' | 'settings' | 'planos' | 'ai' | 'admin' | 'createPost'>('none');
  const [viewingProfileUid, setViewingProfileUid] = useState<string | null>(null);

  // Tema Dark/Light Mono
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('elo_theme') === 'dark';
  });

  // Notificação Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Auth Form State
  const [isSignUp, setIsSignUp] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  // Multi-step Onboarding State
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingData, setOnboardingData] = useState({
    name: '',
    location: '',
    role: '',
    company: '',
    pitch: '',
    lookingFor: ''
  });

  // Feed & Posts State
  const [posts, setPosts] = useState<Post[]>([
    {
      id: 'p1',
      authorUid: 'demo1',
      authorName: 'Afonso Silva',
      authorRole: 'Founder @ TechVentures',
      authorAvatar: '',
      content: 'Lançámos hoje a nova versão da plataforma. O foco em simplicidade máxima reduziu o churn em 40%.',
      timestamp: 'Há 2 horas',
      likes: [],
      comments: [
        { id: 'c1', authorName: 'Beatriz Costa', text: 'Excelente progresso!', timestamp: 'Há 1 hora' }
      ]
    }
  ]);
  const [newPostText, setNewPostText] = useState('');
  const [newPostImage, setNewPostImage] = useState<string | null>(null);
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');

  // Radar de Mercado RSS
  const [rssNews, setRssNews] = useState<{ title: string; link: string }[]>([]);
  const [rssLoading, setRssLoading] = useState(true);
  const [rssError, setRssError] = useState(false);

  // Rede State
  const [networkUsers, setNetworkUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [followingUids, setFollowingUids] = useState<string[]>([]);

  // Notificações State
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    { id: 'n1', type: 'follow', text: 'Beatriz Costa começou a seguir o teu perfil.', timestamp: 'Há 10m', read: false },
    { id: 'n2', type: 'meeting', text: 'Solicitação de reunião enviada por Diogo Melo.', timestamp: 'Há 1h', read: false },
    { id: 'n3', type: 'like', text: 'Gostaram da tua publicação recente.', timestamp: 'Há 3h', read: true }
  ]);

  // AI Assistant State
  const [aiMessages, setAiMessages] = useState<{ sender: 'user' | 'ai'; text: string }[]>([
    { sender: 'ai', text: 'Olá! Sou o assistente do Elo. Como posso ajudar com a tua rede ou perfil hoje?' }
  ]);
  const [aiInput, setAiInput] = useState('');

  // Settings State
  const [settingsTab, setSettingsTab] = useState<'aparencia' | 'conta' | 'privacidade' | 'notificacoes'>('aparencia');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [accountSettingsMsg, setAccountSettingsMsg] = useState('');
  const [visibleInNetwork, setVisibleInNetwork] = useState(true);
  const [acceptsMeetings, setAcceptsMeetings] = useState(true);

  // Admin Dashboard State
  const [pendingRequests, setPendingRequests] = useState<UserProfile[]>([]);
  const [approvedMembers, setApprovedMembers] = useState<UserProfile[]>([]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. AUTH & FIRESTORE REAL-TIME ROUTING
  useEffect(() => {
    let unsubscribeSnapshot: () => void;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        const docRef = doc(db, 'accessRequests', currentUser.uid);
        unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            setUserProfile(data);
            setAccessStatus(data.status);
            setVisibleInNetwork(data.visibleInNetwork !== false);
            setAcceptsMeetings(data.acceptsMeetings !== false);
          } else {
            setAccessStatus('none');
            setUserProfile(null);
          }
          setLoading(false);
        }, () => {
          setLoading(false);
        });
      } else {
        if (unsubscribeSnapshot) unsubscribeSnapshot();
        setAccessStatus('none');
        setUser(null);
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  // Sync Theme
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('elo_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('elo_theme', 'light');
    }
  }, [isDarkMode]);

  // Carregar Radar de Mercado (RSS)
  useEffect(() => {
    if (accessStatus === 'approved') {
      setRssLoading(true);
      fetch('https://api.rss2json.com/v1/api.json?rss_url=https://techcrunch.com/feed/')
        .then(res => res.json())
        .then(data => {
          if (data.items) {
            setRssNews(data.items.slice(0, 5).map((item: any) => ({ title: item.title, link: item.link })));
            setRssError(false);
          } else {
            setRssError(true);
          }
        })
        .catch(() => setRssError(true))
        .finally(() => setRssLoading(false));
    }
  }, [accessStatus]);

  // Carregar Rede Real (Membros Aprovados)
  useEffect(() => {
    if (accessStatus === 'approved') {
      const q = query(collection(db, 'accessRequests'), where('status', '==', 'approved'));
      getDocs(q).then(snapshot => {
        const users: UserProfile[] = [];
        snapshot.forEach(docSnap => {
          const u = docSnap.data() as UserProfile;
          if (u.uid !== user?.uid && u.visibleInNetwork !== false) {
            users.push(u);
          }
        });
        setNetworkUsers(users);
      });
    }
  }, [accessStatus, user]);

  // Carregar dados de Admin
  useEffect(() => {
    if (activeModal === 'admin' && (user?.uid === ADMIN_UID || userProfile?.role === 'Admin')) {
      const qPending = query(collection(db, 'accessRequests'), where('status', '==', 'pending'));
      getDocs(qPending).then(snap => {
        setPendingRequests(snap.docs.map(d => d.data() as UserProfile));
      });

      const qApproved = query(collection(db, 'accessRequests'), where('status', '==', 'approved'));
      getDocs(qApproved).then(snap => {
        setApprovedMembers(snap.docs.map(d => d.data() as UserProfile));
      });
    }
  }, [activeModal, user, userProfile]);

  // Auth Handlers
  const handleGoogleLogin = async () => {
    setAuthError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleGithubLogin = async () => {
    setAuthError('');
    try {
      const provider = new GithubAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
      } else {
        await signInWithEmailAndPassword(auth, emailInput, passwordInput);
      }
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleLogout = () => {
    setActiveModal('none');
    signOut(auth);
  };

  // Submeter Onboarding
  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const payload: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        ...onboardingData,
        status: 'pending',
        visibleInNetwork: true,
        acceptsMeetings: true,
        createdAt: serverTimestamp()
      };
      await setDoc(doc(db, 'accessRequests', user.uid), payload);
    } catch (err: any) {
      setAuthError('Erro ao submeter perfil.');
    }
  };

  // Post Actions
  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostText.trim()) return;

    const newPost: Post = {
      id: Date.now().toString(),
      authorUid: user?.uid || 'anonymous',
      authorName: userProfile?.name || user?.displayName || 'Utilizador',
      authorRole: userProfile?.role || 'Membro Elo',
      authorAvatar: userProfile?.avatarUrl,
      content: newPostText,
      imageUrl: newPostImage || undefined,
      timestamp: 'Agora mesmo',
      likes: [],
      comments: []
    };

    setPosts([newPost, ...posts]);
    setNewPostText('');
    setNewPostImage(null);
    setActiveModal('none');
    showToast('Publicação criada com sucesso!');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewPostImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleLike = (postId: string) => {
    if (!user) return;
    setPosts(posts.map(p => {
      if (p.id === postId) {
        const hasLiked = p.likes.includes(user.uid);
        const updatedLikes = hasLiked 
          ? p.likes.filter(id => id !== user.uid)
          : [...p.likes, user.uid];
        return { ...p, likes: updatedLikes };
      }
      return p;
    }));
  };

  const handleAddComment = (postId: string) => {
    if (!commentInput.trim() || !user) return;
    setPosts(posts.map(p => {
      if (p.id === postId) {
        return {
          ...p,
          comments: [
            ...p.comments,
            {
              id: Date.now().toString(),
              authorName: userProfile?.name || 'Utilizador',
              text: commentInput,
              timestamp: 'Agora'
            }
          ]
        };
      }
      return p;
    }));
    setCommentInput('');
  };

  const handleShare = (postId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/#post-${postId}`);
    showToast('Link copiado para a área de transferência!');
  };

  // Network & Profile Actions
  const toggleFollow = (targetUid: string) => {
    if (followingUids.includes(targetUid)) {
      setFollowingUids(followingUids.filter(id => id !== targetUid));
      showToast('Deixaste de seguir este perfil.');
    } else {
      setFollowingUids([...followingUids, targetUid]);
      showToast('A seguir perfil.');
    }
  };

  const handleRequestMeeting = (targetName: string) => {
    showToast(`Solicitação de reunião enviada a ${targetName}.`);
  };

  // Notifications Actions
  const handleMarkAllNotificationsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
    showToast('Todas as notificações foram marcadas como lidas.');
  };

  // Edit Profile Actions
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userProfile) return;

    try {
      await updateDoc(doc(db, 'accessRequests', user.uid), {
        name: userProfile.name,
        role: userProfile.role,
        location: userProfile.location,
        pitch: userProfile.pitch,
        lookingFor: userProfile.lookingFor,
        avatarUrl: userProfile.avatarUrl || '',
        coverUrl: userProfile.coverUrl || '',
        linkedinUrl: userProfile.linkedinUrl || ''
      });
      setActiveModal('none');
      showToast('Perfil atualizado com sucesso!');
    } catch (err) {
      showToast('Erro ao atualizar perfil.');
    }
  };

  // Settings Handlers
  const handleUpdateEmail = async () => {
    if (!user || !newEmail) return;
    setAccountSettingsMsg('');
    try {
      await updateEmail(user, newEmail);
      await updateDoc(doc(db, 'accessRequests', user.uid), { email: newEmail });
      setAccountSettingsMsg('Email atualizado com sucesso!');
      setNewEmail('');
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setAccountSettingsMsg('Por razões de segurança, faz logout e login novamente para alterar o email.');
      } else {
        setAccountSettingsMsg(`Erro: ${err.message}`);
      }
    }
  };

  const handleUpdatePassword = async () => {
    if (!user || !newPassword) return;
    setAccountSettingsMsg('');
    try {
      await updatePassword(user, newPassword);
      setAccountSettingsMsg('Palavra-passe atualizada com sucesso!');
      setNewPassword('');
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setAccountSettingsMsg('Por razões de segurança, faz logout e login novamente para alterar a palavra-passe.');
      } else {
        setAccountSettingsMsg(`Erro: ${err.message}`);
      }
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !window.confirm('Tem a certeza absoluta que deseja eliminar permanentemente a sua conta? Esta ação não pode ser desfeita.')) return;
    try {
      await deleteDoc(doc(db, 'accessRequests', user.uid));
      await deleteUser(user);
    } catch (err: any) {
      alert('Por razões de segurança, efetue login recente antes de eliminar a conta.');
    }
  };

  const handlePrivacyToggle = async (key: 'visibleInNetwork' | 'acceptsMeetings', val: boolean) => {
    if (!user) return;
    if (key === 'visibleInNetwork') setVisibleInNetwork(val);
    if (key === 'acceptsMeetings') setAcceptsMeetings(val);

    await updateDoc(doc(db, 'accessRequests', user.uid), { [key]: val });
    showToast('Preferências de privacidade guardadas.');
  };

  // AI Assistant Query Handler
  const handleAiSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;

    const userMsg = aiInput;
    setAiMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setAiInput('');

    setTimeout(() => {
      let reply = 'Posso otimizar a tua biografia no Elo para atrair mais investidores e fundadores relevantes.';
      if (userMsg.toLowerCase().includes('reunião') || userMsg.toLowerCase().includes('pitch')) {
        reply = 'Para aceitares pedidos de reunião de alta qualidade, garante que o teu Pitch no perfil descreve claramente a tua proposta de valor.';
      }
      setAiMessages(prev => [...prev, { sender: 'ai', text: reply }]);
    }, 600);
  };

  // Admin Actions
  const handleAdminApprove = async (targetUid: string) => {
    await updateDoc(doc(db, 'accessRequests', targetUid), { status: 'approved' });
    setPendingRequests(pendingRequests.filter(u => u.uid !== targetUid));
    showToast('Membro aprovado com sucesso.');
  };

  const handleAdminReject = async (targetUid: string) => {
    await updateDoc(doc(db, 'accessRequests', targetUid), { status: 'rejected' });
    setPendingRequests(pendingRequests.filter(u => u.uid !== targetUid));
    showToast('Acesso rejeitado.');
  };

  const handleAdminRevoke = async (targetUid: string) => {
    await updateDoc(doc(db, 'accessRequests', targetUid), { status: 'rejected' });
    setApprovedMembers(approvedMembers.filter(u => u.uid !== targetUid));
    showToast('Acesso revogado.');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex items-center justify-center font-sans">
        <div className="w-6 h-6 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // RENDERING DA INTERFACE CONFORME AUTH STATUS
  if (user) {
    // Status: Pending
    if (accessStatus === 'pending') {
      return (
        <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex flex-col justify-center items-center p-8 font-sans">
          <div className="max-w-md w-full text-center space-y-6">
            <img src={logo} alt="Elo" className="mx-auto h-16 w-auto dark:invert" />
            <h1 className="text-2xl font-semibold tracking-tight">Pedido Enviado</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              O teu perfil encontra-se sob revisão. Analisamos todas as candidaturas individualmente para manter a qualidade da comunidade.
            </p>
            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-black dark:hover:text-white underline transition-colors">
              Sair da conta
            </button>
          </div>
        </div>
      );
    }

    // Status: Rejected
    if (accessStatus === 'rejected') {
      return (
        <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex flex-col justify-center items-center p-8 font-sans">
          <div className="max-w-md w-full text-center space-y-6">
            <img src={logo} alt="Elo" className="mx-auto h-16 w-auto dark:invert" />
            <h1 className="text-2xl font-semibold tracking-tight">Acesso Não Aprovado</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              De momento, não nos é possível aprovar o teu acesso ao Elo. Agradecemos o interesse.
            </p>
            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-black dark:hover:text-white underline transition-colors">
              Sair da conta
            </button>
          </div>
        </div>
      );
    }

    // Status: None -> Multi-step Onboarding
    if (accessStatus === 'none') {
      return (
        <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex flex-col justify-center items-center p-6 font-sans">
          <div className="max-w-md w-full space-y-8">
            <div className="text-center">
              <img src={logo} alt="Elo" className="mx-auto h-16 w-auto mb-6 dark:invert" />
              <h2 className="text-xl font-medium tracking-tight">Completa o teu perfil</h2>
              <div className="flex justify-center gap-2 mt-4 text-xs text-gray-400">
                <span className={onboardingStep >= 1 ? "text-black dark:text-white font-semibold" : ""}>1. Dados</span> •
                <span className={onboardingStep >= 2 ? "text-black dark:text-white font-semibold" : ""}>2. Percurso</span> •
                <span className={onboardingStep >= 3 ? "text-black dark:text-white font-semibold" : ""}>3. Objetivos</span>
              </div>
            </div>

            <form onSubmit={onboardingStep === 3 ? handleOnboardingSubmit : (e) => { e.preventDefault(); setOnboardingStep(onboardingStep + 1); }} className="space-y-4">
              {onboardingStep === 1 && (
                <>
                  <input 
                    type="text" 
                    placeholder="Nome Completo" 
                    value={onboardingData.name} 
                    onChange={e => setOnboardingData({ ...onboardingData, name: e.target.value })} 
                    required 
                    className="w-full border-b border-gray-300 dark:border-gray-800 bg-transparent py-3 text-sm focus:outline-none focus:border-black dark:focus:border-white"
                  />
                  <input 
                    type="text" 
                    placeholder="Localização (ex: Lisboa, Portugal)" 
                    value={onboardingData.location} 
                    onChange={e => setOnboardingData({ ...onboardingData, location: e.target.value })} 
                    required 
                    className="w-full border-b border-gray-300 dark:border-gray-800 bg-transparent py-3 text-sm focus:outline-none focus:border-black dark:focus:border-white"
                  />
                </>
              )}

              {onboardingStep === 2 && (
                <>
                  <input 
                    type="text" 
                    placeholder="Cargo / Função" 
                    value={onboardingData.role} 
                    onChange={e => setOnboardingData({ ...onboardingData, role: e.target.value })} 
                    required 
                    className="w-full border-b border-gray-300 dark:border-gray-800 bg-transparent py-3 text-sm focus:outline-none focus:border-black dark:focus:border-white"
                  />
                  <input 
                    type="text" 
                    placeholder="Empresa / Projeto" 
                    value={onboardingData.company} 
                    onChange={e => setOnboardingData({ ...onboardingData, company: e.target.value })} 
                    required 
                    className="w-full border-b border-gray-300 dark:border-gray-800 bg-transparent py-3 text-sm focus:outline-none focus:border-black dark:focus:border-white"
                  />
                  <textarea 
                    placeholder="O teu Pitch curto" 
                    value={onboardingData.pitch} 
                    onChange={e => setOnboardingData({ ...onboardingData, pitch: e.target.value })} 
                    required 
                    className="w-full border border-gray-300 dark:border-gray-800 bg-transparent p-3 rounded-lg text-sm h-24 focus:outline-none focus:border-black dark:focus:border-white"
                  />
                </>
              )}

              {onboardingStep === 3 && (
                <textarea 
                  placeholder="O que procuras no Elo? (ex: Co-founders, Investidores, Talento)" 
                  value={onboardingData.lookingFor} 
                  onChange={e => setOnboardingData({ ...onboardingData, lookingFor: e.target.value })} 
                  required 
                  className="w-full border border-gray-300 dark:border-gray-800 bg-transparent p-3 rounded-lg text-sm h-32 focus:outline-none focus:border-black dark:focus:border-white"
                />
              )}

              <div className="flex justify-between gap-4 pt-4">
                {onboardingStep > 1 && (
                  <button 
                    type="button" 
                    onClick={() => setOnboardingStep(onboardingStep - 1)} 
                    className="w-1/2 py-3 border border-gray-300 dark:border-gray-800 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    Voltar
                  </button>
                )}
                <button 
                  type="submit" 
                  className={`py-3 bg-black text-white dark:bg-white dark:text-black rounded-lg text-sm font-medium ${onboardingStep === 1 ? 'w-full' : 'w-1/2'}`}
                >
                  {onboardingStep === 3 ? 'Submeter Pedido' : 'Continuar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    // MAIN APP SHELL (Status: Approved)
    const activeProfile = viewingProfileUid 
      ? networkUsers.find(u => u.uid === viewingProfileUid) || userProfile 
      : userProfile;

    return (
      <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-sans flex flex-col pb-20 md:pb-0">
        
        {/* Toast Toast Notification */}
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-black text-white dark:bg-white dark:text-black px-4 py-2.5 rounded-lg text-xs shadow-lg">
            {toastMessage}
          </div>
        )}

        {/* Top Nav (Desktop & Tablet) */}
        <header className="border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white/80 dark:bg-black/80 backdrop-blur-md z-40">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <img src={logo} alt="Elo" className="h-8 w-auto dark:invert cursor-pointer" onClick={() => { setCurrentTab('feed'); setViewingProfileUid(null); }} />
              <nav className="hidden md:flex gap-6 text-sm font-medium">
                <button onClick={() => { setCurrentTab('feed'); setViewingProfileUid(null); }} className={currentTab === 'feed' ? 'text-black dark:text-white' : 'text-gray-400 hover:text-black dark:hover:text-white'}>Feed</button>
                <button onClick={() => { setCurrentTab('rede'); setViewingProfileUid(null); }} className={currentTab === 'rede' ? 'text-black dark:text-white' : 'text-gray-400 hover:text-black dark:hover:text-white'}>Rede</button>
                <button onClick={() => { setCurrentTab('notificacoes'); setViewingProfileUid(null); }} className={currentTab === 'notificacoes' ? 'text-black dark:text-white' : 'text-gray-400 hover:text-black dark:hover:text-white'}>Notificações</button>
                <button onClick={() => { setCurrentTab('perfil'); setViewingProfileUid(null); }} className={currentTab === 'perfil' && !viewingProfileUid ? 'text-black dark:text-white' : 'text-gray-400 hover:text-black dark:hover:text-white'}>Perfil</button>
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setActiveModal('ai')} className="text-xs border border-gray-300 dark:border-gray-800 px-3 py-1.5 rounded-full hover:border-black dark:hover:border-white">
                Elo AI
              </button>
              <button onClick={() => setActiveModal('planos')} className="text-xs bg-black text-white dark:bg-white dark:text-black px-3 py-1.5 rounded-full">
                Pro
              </button>
              <button onClick={() => setActiveModal('settings')} className="text-xs text-gray-400 hover:text-black dark:hover:text-white">
                Definições
              </button>
              {(user.uid === ADMIN_UID || userProfile?.role === 'Admin') && (
                <button onClick={() => setActiveModal('admin')} className="text-xs border border-gray-400 px-2 py-1 rounded">
                  Admin
                </button>
              )}
              <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-black dark:hover:text-white">
                Sair
              </button>
            </div>
          </div>
        </header>

        {/* Main Body */}
        <main className="max-w-5xl mx-auto px-4 py-8 flex-1 w-full">
          
          {/* TAB 1: FEED */}
          {currentTab === 'feed' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-6">
                <button 
                  onClick={() => setActiveModal('createPost')}
                  className="w-full text-left border border-gray-200 dark:border-gray-800 p-4 rounded-xl text-sm text-gray-400 hover:border-black dark:hover:border-white transition-colors"
                >
                  Criar uma publicação...
                </button>

                <div className="space-y-6">
                  {posts.map(post => (
                    <article key={post.id} className="border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center font-bold text-xs uppercase">
                            {post.authorAvatar ? <img src={post.authorAvatar} alt="" className="w-full h-full rounded-full object-cover" /> : post.authorName.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{post.authorName}</p>
                            <p className="text-xs text-gray-400">{post.authorRole}</p>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">{post.timestamp}</span>
                      </div>

                      <p className="text-sm leading-relaxed">{post.content}</p>

                      {post.imageUrl && (
                        <img src={post.imageUrl} alt="" className="rounded-lg w-full max-h-80 object-cover border border-gray-100 dark:border-gray-900" />
                      )}

                      <div className="flex items-center gap-6 text-xs text-gray-500 pt-2 border-t border-gray-100 dark:border-gray-900">
                        <button onClick={() => toggleLike(post.id)} className={`hover:text-black dark:hover:text-white ${post.likes.includes(user.uid) ? 'font-bold text-black dark:text-white' : ''}`}>
                          Gostar ({post.likes.length})
                        </button>
                        <button onClick={() => setActiveCommentPostId(activeCommentPostId === post.id ? null : post.id)} className="hover:text-black dark:hover:text-white">
                          Comentar ({post.comments.length})
                        </button>
                        <button onClick={() => handleShare(post.id)} className="hover:text-black dark:hover:text-white">
                          Partilhar
                        </button>
                      </div>

                      {/* Comments Section */}
                      {activeCommentPostId === post.id && (
                        <div className="pt-4 border-t border-gray-100 dark:border-gray-900 space-y-3">
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              placeholder="Escreve um comentário..." 
                              value={commentInput} 
                              onChange={e => setCommentInput(e.target.value)}
                              className="flex-1 border border-gray-200 dark:border-gray-800 bg-transparent px-3 py-1.5 rounded-lg text-xs focus:outline-none"
                            />
                            <button onClick={() => handleAddComment(post.id)} className="bg-black text-white dark:bg-white dark:text-black px-3 py-1.5 rounded-lg text-xs font-medium">
                              Enviar
                            </button>
                          </div>
                          <div className="space-y-2">
                            {post.comments.map(c => (
                              <div key={c.id} className="bg-gray-50 dark:bg-gray-900 p-2.5 rounded-lg text-xs space-y-1">
                                <span className="font-semibold">{c.authorName}</span>
                                <p className="text-gray-600 dark:text-gray-300">{c.text}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Radar de Mercado</h3>
                  {rssLoading && <p className="text-xs text-gray-400">A carregar notícias...</p>}
                  {rssError && <p className="text-xs text-gray-400">Não foi possível carregar o feed de notícias.</p>}
                  {!rssLoading && !rssError && (
                    <ul className="space-y-2.5">
                      {rssNews.map((news, idx) => (
                        <li key={idx}>
                          <a href={news.link} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline line-clamp-2 leading-tight">
                            {news.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Dica do Mês</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    Mantém o teu perfil atualizado com objetivos claros. Mencionares exatamente o tipo de apoio que procuras duplica a taxa de resposta a pedidos de reunião.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: REDE */}
          {currentTab === 'rede' && (
            <div className="space-y-6">
              <input 
                type="text" 
                placeholder="Pesquisar por nome, cargo ou localização..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-3 rounded-xl text-sm focus:outline-none"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {networkUsers
                  .filter(u => 
                    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    u.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    u.location.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map(netUser => (
                    <div key={netUser.uid} className="border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center font-bold text-sm uppercase">
                          {netUser.avatarUrl ? <img src={netUser.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" /> : netUser.name.charAt(0)}
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-semibold">{netUser.name}</h4>
                          <p className="text-xs text-gray-500">{netUser.role} • {netUser.location}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{netUser.pitch}</p>
                          {netUser.lookingFor && (
                            <span className="inline-block mt-2 text-[10px] border border-gray-300 dark:border-gray-700 px-2 py-0.5 rounded-full">
                              Procura: {netUser.lookingFor}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-900">
                        <button 
                          onClick={() => { setViewingProfileUid(netUser.uid); setCurrentTab('perfil'); }} 
                          className="flex-1 py-1.5 border border-gray-200 dark:border-gray-800 rounded-lg text-xs hover:border-black dark:hover:border-white"
                        >
                          Ver Perfil
                        </button>
                        <button 
                          onClick={() => toggleFollow(netUser.uid)} 
                          className="flex-1 py-1.5 bg-black text-white dark:bg-white dark:text-black rounded-lg text-xs font-medium"
                        >
                          {followingUids.includes(netUser.uid) ? 'A seguir' : 'Seguir'}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TAB 3: NOTIFICAÇÕES */}
          {currentTab === 'notificacoes' && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-base font-semibold">Notificações</h2>
                <button onClick={handleMarkAllNotificationsRead} className="text-xs text-gray-400 hover:text-black dark:hover:text-white">
                  Marcar todas como lidas
                </button>
              </div>

              <div className="space-y-2">
                {notifications.map(n => (
                  <div key={n.id} className={`p-4 rounded-xl border flex items-center justify-between ${n.read ? 'border-gray-100 dark:border-gray-900 opacity-60' : 'border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50'}`}>
                    <p className="text-xs">{n.text}</p>
                    <span className="text-[10px] text-gray-400">{n.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: PERFIL */}
          {currentTab === 'perfil' && activeProfile && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                <div className="h-32 bg-gray-100 dark:bg-gray-900 relative">
                  {activeProfile.coverUrl && <img src={activeProfile.coverUrl} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="p-6 relative pt-0">
                  <div className="w-20 h-20 bg-gray-200 dark:bg-gray-800 rounded-full border-4 border-white dark:border-black flex items-center justify-center font-bold text-xl uppercase -mt-10 mb-4">
                    {activeProfile.avatarUrl ? <img src={activeProfile.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" /> : activeProfile.name.charAt(0)}
                  </div>

                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-bold">{activeProfile.name}</h2>
                      <p className="text-xs text-gray-500">{activeProfile.role} • {activeProfile.location}</p>
                    </div>

                    {/* Botões do Perfil Próprio vs Outros */}
                    {!viewingProfileUid || viewingProfileUid === user.uid ? (
                      <button onClick={() => setActiveModal('settings')} className="text-xs border border-gray-300 dark:border-gray-700 px-3 py-1.5 rounded-lg hover:border-black dark:hover:border-white">
                        Editar Perfil
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => handleRequestMeeting(activeProfile.name)} className="text-xs bg-black text-white dark:bg-white dark:text-black px-3 py-1.5 rounded-lg">
                          Reunião
                        </button>
                        <button onClick={() => toggleFollow(activeProfile.uid)} className="text-xs border border-gray-300 dark:border-gray-700 px-3 py-1.5 rounded-lg">
                          {followingUids.includes(activeProfile.uid) ? 'A seguir' : 'Seguir'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 space-y-4 text-xs">
                    <div>
                      <h4 className="font-semibold uppercase text-gray-400 text-[10px] tracking-wider mb-1">Pitch / Sobre</h4>
                      <p className="leading-relaxed">{activeProfile.pitch}</p>
                    </div>

                    {activeProfile.lookingFor && (
                      <div>
                        <h4 className="font-semibold uppercase text-gray-400 text-[10px] tracking-wider mb-1">O que procura</h4>
                        <p>{activeProfile.lookingFor}</p>
                      </div>
                    )}

                    {activeProfile.linkedinUrl && (
                      <div>
                        <a href={activeProfile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-500">
                          LinkedIn
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>

        {/* Bottom Nav (Mobile) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800 flex justify-around py-3 text-xs z-40">
          <button onClick={() => { setCurrentTab('feed'); setViewingProfileUid(null); }} className={currentTab === 'feed' ? 'font-bold' : 'text-gray-400'}>Feed</button>
          <button onClick={() => { setCurrentTab('rede'); setViewingProfileUid(null); }} className={currentTab === 'rede' ? 'font-bold' : 'text-gray-400'}>Rede</button>
          <button onClick={() => { setCurrentTab('notificacoes'); setViewingProfileUid(null); }} className={currentTab === 'notificacoes' ? 'font-bold' : 'text-gray-400'}>Notificações</button>
          <button onClick={() => { setCurrentTab('perfil'); setViewingProfileUid(null); }} className={currentTab === 'perfil' && !viewingProfileUid ? 'font-bold' : 'text-gray-400'}>Perfil</button>
        </nav>

        {/* MODAIS */}

        {/* Modal 1: Criar Publicação */}
        {activeModal === 'createPost' && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-lg w-full space-y-4">
              <h3 className="text-base font-semibold">Nova Publicação</h3>
              <form onSubmit={handleCreatePost} className="space-y-4">
                <textarea 
                  placeholder="O que queres partilhar com a rede?" 
                  value={newPostText} 
                  onChange={e => setNewPostText(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-3 rounded-xl text-sm h-32 focus:outline-none"
                />
                <input type="file" accept="image/*" onChange={handleImageUpload} className="text-xs" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setActiveModal('none')} className="px-4 py-2 border border-gray-200 dark:border-gray-800 rounded-lg text-xs">Cancelar</button>
                  <button type="submit" className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black rounded-lg text-xs font-medium">Publicar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal 2: Definições */}
        {activeModal === 'settings' && userProfile && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-xl w-full space-y-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 pb-3">
                <h3 className="text-base font-semibold">Definições</h3>
                <button onClick={() => setActiveModal('none')} className="text-xs text-gray-400">Fechar</button>
              </div>

              <div className="flex gap-4 border-b border-gray-100 dark:border-gray-900 text-xs">
                <button onClick={() => setSettingsTab('aparencia')} className={settingsTab === 'aparencia' ? 'font-bold border-b-2 border-black dark:border-white pb-2' : 'text-gray-400 pb-2'}>Aparência</button>
                <button onClick={() => setSettingsTab('conta')} className={settingsTab === 'conta' ? 'font-bold border-b-2 border-black dark:border-white pb-2' : 'text-gray-400 pb-2'}>Conta</button>
                <button onClick={() => setSettingsTab('privacidade')} className={settingsTab === 'privacidade' ? 'font-bold border-b-2 border-black dark:border-white pb-2' : 'text-gray-400 pb-2'}>Privacidade</button>
                <button onClick={() => setSettingsTab('notificacoes')} className={settingsTab === 'notificacoes' ? 'font-bold border-b-2 border-black dark:border-white pb-2' : 'text-gray-400 pb-2'}>Editar Perfil</button>
              </div>

              {/* Aba Aparência */}
              {settingsTab === 'aparencia' && (
                <div className="flex items-center justify-between text-xs">
                  <span>Modo Escuro</span>
                  <button onClick={() => setIsDarkMode(!isDarkMode)} className="border border-gray-300 dark:border-gray-700 px-3 py-1.5 rounded-lg">
                    {isDarkMode ? 'Ativo' : 'Inativo'}
                  </button>
                </div>
              )}

              {/* Aba Conta */}
              {settingsTab === 'conta' && (
                <div className="space-y-4 text-xs">
                  {accountSettingsMsg && <p className="p-2 bg-gray-100 dark:bg-gray-900 rounded">{accountSettingsMsg}</p>}
                  <div className="space-y-2">
                    <p className="font-semibold">Alterar Email</p>
                    <input type="email" placeholder="Novo email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-2 rounded-lg" />
                    <button onClick={handleUpdateEmail} className="px-3 py-1.5 bg-black text-white dark:bg-white dark:text-black rounded-lg">Atualizar Email</button>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-900">
                    <p className="font-semibold">Alterar Palavra-passe</p>
                    <input type="password" placeholder="Nova palavra-passe" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-2 rounded-lg" />
                    <button onClick={handleUpdatePassword} className="px-3 py-1.5 bg-black text-white dark:bg-white dark:text-black rounded-lg">Atualizar Palavra-passe</button>
                  </div>

                  <div className="pt-4 border-t border-gray-100 dark:border-gray-900">
                    <button onClick={handleDeleteAccount} className="text-red-500 underline">Eliminar Conta Definitivamente</button>
                  </div>
                </div>
              )}

              {/* Aba Privacidade */}
              {settingsTab === 'privacidade' && (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span>Perfil visível na Rede</span>
                    <button onClick={() => handlePrivacyToggle('visibleInNetwork', !visibleInNetwork)} className="border border-gray-300 dark:border-gray-700 px-3 py-1.5 rounded-lg">
                      {visibleInNetwork ? 'Sim' : 'Não'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Aceitar pedidos de reunião</span>
                    <button onClick={() => handlePrivacyToggle('acceptsMeetings', !acceptsMeetings)} className="border border-gray-300 dark:border-gray-700 px-3 py-1.5 rounded-lg">
                      {acceptsMeetings ? 'Sim' : 'Não'}
                    </button>
                  </div>
                </div>
              )}

              {/* Aba Editar Perfil */}
              {settingsTab === 'notificacoes' && (
                <form onSubmit={handleUpdateProfile} className="space-y-3 text-xs">
                  <input type="text" placeholder="Nome" value={userProfile.name} onChange={e => setUserProfile({ ...userProfile, name: e.target.value })} className="w-full border p-2 rounded-lg bg-transparent border-gray-200 dark:border-gray-800" />
                  <input type="text" placeholder="Cargo" value={userProfile.role} onChange={e => setUserProfile({ ...userProfile, role: e.target.value })} className="w-full border p-2 rounded-lg bg-transparent border-gray-200 dark:border-gray-800" />
                  <input type="text" placeholder="Localização" value={userProfile.location} onChange={e => setUserProfile({ ...userProfile, location: e.target.value })} className="w-full border p-2 rounded-lg bg-transparent border-gray-200 dark:border-gray-800" />
                  <textarea placeholder="Pitch" value={userProfile.pitch} onChange={e => setUserProfile({ ...userProfile, pitch: e.target.value })} className="w-full border p-2 rounded-lg bg-transparent border-gray-200 dark:border-gray-800 h-20" />
                  <button type="submit" className="w-full py-2 bg-black text-white dark:bg-white dark:text-black rounded-lg font-medium">Guardar Alterações</button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Modal 3: Planos */}
        {activeModal === 'planos' && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-sm w-full space-y-4 text-center">
              <h3 className="text-base font-semibold">Conta Pro Ativa</h3>
              <p className="text-xs text-gray-500">
                A tua conta tem acesso Pro total e ilimitado incluído na aprovação da comunidade.
              </p>
              <button onClick={() => setActiveModal('none')} className="w-full py-2 bg-black text-white dark:bg-white dark:text-black rounded-lg text-xs font-medium">
                Entendido
              </button>
            </div>
          </div>
        )}

        {/* Modal 4: AI Assistant */}
        {activeModal === 'ai' && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-md w-full space-y-4 flex flex-col h-[500px]">
              <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 pb-2">
                <h3 className="text-sm font-semibold">Assistente Elo AI</h3>
                <button onClick={() => setActiveModal('none')} className="text-xs text-gray-400">Fechar</button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 text-xs">
                {aiMessages.map((m, idx) => (
                  <div key={idx} className={`p-3 rounded-xl max-w-[80%] ${m.sender === 'user' ? 'bg-black text-white dark:bg-white dark:text-black ml-auto' : 'bg-gray-100 dark:bg-gray-900 text-black dark:text-white'}`}>
                    {m.text}
                  </div>
                ))}
              </div>

              <form onSubmit={handleAiSend} className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-800">
                <input 
                  type="text" 
                  placeholder="Pergunta à AI..." 
                  value={aiInput} 
                  onChange={e => setAiInput(e.target.value)} 
                  className="flex-1 border border-gray-200 dark:border-gray-800 bg-transparent px-3 py-2 rounded-lg text-xs focus:outline-none"
                />
                <button type="submit" className="bg-black text-white dark:bg-white dark:text-black px-3 py-2 rounded-lg text-xs">Enviar</button>
              </form>
            </div>
          </div>
        )}

        {/* Modal 5: Admin Dashboard */}
        {activeModal === 'admin' && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-2xl w-full space-y-6 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 pb-3">
                <h3 className="text-base font-semibold">Painel de Administração</h3>
                <button onClick={() => setActiveModal('none')} className="text-xs text-gray-400">Fechar</button>
              </div>

              {/* Pedidos Pendentes */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase text-gray-400">Pedidos Pendentes ({pendingRequests.length})</h4>
                {pendingRequests.length === 0 ? <p className="text-xs text-gray-500">Sem pedidos pendentes.</p> : (
                  <div className="space-y-2">
                    {pendingRequests.map(req => (
                      <div key={req.uid} className="border border-gray-200 dark:border-gray-800 p-3 rounded-lg text-xs flex justify-between items-center">
                        <div>
                          <p className="font-semibold">{req.name} ({req.email})</p>
                          <p className="text-gray-500">{req.role} • {req.location}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleAdminApprove(req.uid)} className="px-2.5 py-1 bg-black text-white dark:bg-white dark:text-black rounded text-[10px]">Aprovar</button>
                          <button onClick={() => handleAdminReject(req.uid)} className="px-2.5 py-1 border border-red-500 text-red-500 rounded text-[10px]">Rejeitar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Membros Aprovados */}
              <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-900">
                <h4 className="text-xs font-bold uppercase text-gray-400">Membros Ativos ({approvedMembers.length})</h4>
                <div className="space-y-2">
                  {approvedMembers.map(memb => (
                    <div key={memb.uid} className="border border-gray-100 dark:border-gray-900 p-3 rounded-lg text-xs flex justify-between items-center">
                      <div>
                        <p className="font-semibold">{memb.name}</p>
                        <p className="text-gray-500">{memb.email}</p>
                      </div>
                      <button onClick={() => handleAdminRevoke(memb.uid)} className="px-2 py-1 text-red-500 underline text-[10px]">Revogar Acesso</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // FORMULÁRIO PÚBLICO DE AUTENTICAÇÃO INICIAL
  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <img src={logo} alt="Elo" className="mx-auto h-20 w-auto mb-4 dark:invert" />
        <h2 className="text-2xl font-semibold tracking-tight">
          {isSignUp ? 'Criar a tua conta no Elo' : 'Bem-vindo de volta ao Elo'}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-black py-8 px-10 border border-gray-200 dark:border-gray-800 rounded-2xl">
          
          {authError && (
            <div className="mb-4 p-3 border border-red-500/30 text-red-500 text-xs rounded-lg">
              {authError}
            </div>
          )}

          <div className="space-y-3">
            <button 
              onClick={handleGoogleLogin}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium hover:border-black dark:hover:border-white transition-colors"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
              Continuar com Google
            </button>
            
            <button 
              onClick={handleGithubLogin}
              className="w-full flex justify-center items-center py-2.5 px-4 bg-black text-white dark:bg-white dark:text-black rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
              Continuar com GitHub
            </button>
          </div>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-800" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-white dark:bg-black text-gray-400">ou email</span>
              </div>
            </div>

            <form onSubmit={handleEmailAuth} className="mt-6 space-y-4">
              <input 
                type="email" 
                placeholder="Email" 
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                required
                className="block w-full border border-gray-300 dark:border-gray-800 bg-transparent rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:border-black dark:focus:border-white" 
              />
              <input 
                type="password" 
                placeholder="Palavra-passe" 
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                required
                className="block w-full border border-gray-300 dark:border-gray-800 bg-transparent rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:border-black dark:focus:border-white" 
              />
              <button 
                type="submit"
                className="w-full py-2.5 bg-black text-white dark:bg-white dark:text-black rounded-lg text-sm font-medium"
              >
                {isSignUp ? 'Registar' : 'Entrar'}
              </button>
            </form>
          </div>

          <div className="mt-6 text-center">
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs text-gray-500 hover:text-black dark:hover:text-white"
            >
              {isSignUp ? 'Já tens conta? Entrar' : 'Não tens conta? Criar uma'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
