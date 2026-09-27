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
  serverTimestamp,
  addDoc,
  orderBy,
  arrayUnion,
  arrayRemove,
  getCountFromServer
} from 'firebase/firestore';
import { ThumbsUp, MessageCircle, Share2, Image as ImageIcon, Send, User as UserIcon, Menu, X, Inbox, Users, Bell, Camera, Palette, Shield, Pencil, Calendar, MapPin, ExternalLink, Plus } from 'lucide-react';
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
  createdAt?: any;
  likes: string[];
  comments: { id: string; authorName: string; text: string; timestamp: string }[];
}

interface NotificationItem {
  id: string;
  type: 'follow' | 'meeting' | 'like';
  text: string;
  timestamp: string;
  read: boolean;
}

interface EloEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  capacity: string;
  attendees: string[];
  createdBy: string;
}

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any, errorInfo: any) { console.error("App Error Boundary Catch:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f5f5f7] dark:bg-black text-black dark:text-white flex flex-col justify-center items-center font-sans">
          <h1 className="text-xl font-bold mb-4">Algo correu mal.</h1>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black rounded-lg text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white">
            Recarrega a página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('none');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [editFormData, setEditFormData] = useState<UserProfile | null>(null);

  const [currentTab, setCurrentTab] = useState<'feed' | 'rede' | 'notificacoes' | 'perfil'>('feed');
  const [activeModal, setActiveModal] = useState<'none' | 'settings' | 'planos' | 'ai' | 'admin' | 'createPost' | 'createMeeting' | 'createEvent'>('none');
  const [viewingProfileUid, setViewingProfileUid] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem('elo_theme') === 'dark');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [isSignUp, setIsSignUp] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingData, setOnboardingData] = useState({ name: '', location: '', role: '', company: '', pitch: '', lookingFor: '' });

  const [fetchingPosts, setFetchingPosts] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostText, setNewPostText] = useState('');
  const [newPostImage, setNewPostImage] = useState<string | null>(null);
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');

  const [rssNews, setRssNews] = useState<{ title: string; link: string }[]>([]);
  const [rssLoading, setRssLoading] = useState(true);
  const [rssError, setRssError] = useState(false);

  const [fetchingNetwork, setFetchingNetwork] = useState(true);
  const [networkUsers, setNetworkUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [followingUids, setFollowingUids] = useState<string[]>([]);

  const [events, setEvents] = useState<EloEvent[]>([]);

  const [meetingData, setMeetingData] = useState({ targetUid: '', date: '', time: '', message: '' });
  const [eventData, setEventData] = useState({ title: '', description: '', date: '', time: '', location: '', capacity: '' });

  const [activeProfilePostCount, setActiveProfilePostCount] = useState<number | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    { id: 'n1', type: 'follow', text: 'Beatriz Costa começou a seguir o teu perfil.', timestamp: 'Há 10m', read: false },
    { id: 'n2', type: 'meeting', text: 'Solicitação de reunião enviada por Diogo Melo.', timestamp: 'Há 1h', read: false }
  ]);

  const [aiMessages, setAiMessages] = useState<{ sender: 'user' | 'ai'; text: string }[]>([
    { sender: 'ai', text: 'Olá! Sou o assistente do Elo. Como posso ajudar com a tua rede ou perfil hoje?' }
  ]);
  const [aiInput, setAiInput] = useState('');

  const [settingsTab, setSettingsTab] = useState<'aparencia' | 'conta' | 'privacidade' | 'notificacoes' | 'perfil'>('aparencia');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [accountSettingsMsg, setAccountSettingsMsg] = useState('');
  const [visibleInNetwork, setVisibleInNetwork] = useState(true);
  const [acceptsMeetings, setAcceptsMeetings] = useState(true);

  const [notifFollowers, setNotifFollowers] = useState<boolean>(() => localStorage.getItem('elo_notif_followers') !== 'false');
  const [notifMeetings, setNotifMeetings] = useState<boolean>(() => localStorage.getItem('elo_notif_meetings') !== 'false');

  const [pendingRequests, setPendingRequests] = useState<UserProfile[]>([]);
  const [approvedMembers, setApprovedMembers] = useState<UserProfile[]>([]);

  const btnFocus = "focus:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:ring-offset-2 dark:focus-visible:ring-offset-black";

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.style.display = 'none';
  };

  useEffect(() => {
    document.title = "Elo — Rede de Fundadores";
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', 'A rede exclusiva para fundadores e investidores em Portugal.');
    let linkIcon = document.querySelector('link[rel="icon"]');
    if (!linkIcon) {
      linkIcon = document.createElement('link');
      linkIcon.setAttribute('rel', 'icon');
      document.head.appendChild(linkIcon);
    }
    linkIcon.setAttribute('href', logo);
  }, []);

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
          showToast("Erro ao carregar dados. Tenta recarregar a página.");
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
    return () => { unsubscribeAuth(); if (unsubscribeSnapshot) unsubscribeSnapshot(); };
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('elo_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('elo_theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (accessStatus === 'approved') {
      const qPosts = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
      const unsubPosts = onSnapshot(qPosts, snap => {
        setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Post)));
        setFetchingPosts(false);
      }, () => showToast("Erro ao carregar dados. Tenta recarregar a página."));

      const qEvents = query(collection(db, 'events'), orderBy('date', 'asc'));
      const unsubEvents = onSnapshot(qEvents, snap => {
        setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as EloEvent)));
      }, () => showToast("Erro ao carregar dados. Tenta recarregar a página."));

      setRssLoading(true);
      fetch('https://api.rss2json.com/v1/api.json?rss_url=https://techcrunch.com/feed/')
        .then(res => res.json())
        .then(data => {
          if (data.items) {
            setRssNews(data.items.slice(0, 5).map((item: any) => ({ title: item.title, link: item.link })));
            setRssError(false);
          } else setRssError(true);
        })
        .catch(() => setRssError(true))
        .finally(() => setRssLoading(false));

      return () => { unsubPosts(); unsubEvents(); };
    }
  }, [accessStatus]);

  useEffect(() => {
    if (accessStatus === 'approved') {
      const q = query(collection(db, 'accessRequests'), where('status', '==', 'approved'));
      const unsubNetwork = onSnapshot(q, snapshot => {
        const users: UserProfile[] = [];
        snapshot.forEach(docSnap => {
          const u = docSnap.data() as UserProfile;
          if (u.uid !== user?.uid && u.visibleInNetwork !== false) users.push(u);
        });
        setNetworkUsers(users);
        setFetchingNetwork(false);
      }, () => showToast("Erro ao carregar dados. Tenta recarregar a página."));
      return () => unsubNetwork();
    }
  }, [accessStatus, user]);

  useEffect(() => {
    if (activeModal === 'admin' && user?.uid === ADMIN_UID) {
      const qPending = query(collection(db, 'accessRequests'), where('status', '==', 'pending'));
      getDocs(qPending).then(snap => setPendingRequests(snap.docs.map(d => d.data() as UserProfile)));
      const qApproved = query(collection(db, 'accessRequests'), where('status', '==', 'approved'));
      getDocs(qApproved).then(snap => setApprovedMembers(snap.docs.map(d => d.data() as UserProfile)));
    }
  }, [activeModal, user]);

  useEffect(() => {
    if (activeModal === 'settings' && settingsTab === 'perfil' && userProfile) {
      setEditFormData({ ...userProfile });
    }
  }, [activeModal, settingsTab, userProfile]);

  useEffect(() => {
    if (currentTab === 'perfil') {
      const targetUid = viewingProfileUid || user?.uid;
      if (targetUid) {
        const fetchPostCount = async () => {
          try {
            const coll = collection(db, 'posts');
            const q = query(coll, where('authorUid', '==', targetUid));
            const snapshot = await getCountFromServer(q);
            setActiveProfilePostCount(snapshot.data().count);
          } catch (e) {
            setActiveProfilePostCount(null);
          }
        };
        fetchPostCount();
      }
    }
  }, [currentTab, viewingProfileUid, user?.uid]);

  const handleGoogleLogin = async () => {
    setAuthError('');
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (err: any) { setAuthError(err.message); }
  };

  const handleGithubLogin = async () => {
    setAuthError('');
    try { await signInWithPopup(auth, new GithubAuthProvider()); } 
    catch (err: any) { setAuthError(err.message); }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isSignUp) await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
      else await signInWithEmailAndPassword(auth, emailInput, passwordInput);
    } catch (err: any) {
      let msg = "Erro na autenticação.";
      if (err.code === 'auth/invalid-email') msg = "Email inválido.";
      else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') msg = "Password incorreta.";
      else if (err.code === 'auth/email-already-in-use') msg = "Este email já está registado. Tenta entrar em vez de criar conta.";
      else if (err.code === 'auth/weak-password') msg = "A palavra-passe deve ter pelo menos 6 caracteres.";
      setAuthError(msg);
    }
  };

  const handleLogout = () => { setActiveModal('none'); signOut(auth); };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const payload: UserProfile = {
        uid: user.uid, email: user.email || '', ...onboardingData, status: 'pending',
        visibleInNetwork: true, acceptsMeetings: true, createdAt: serverTimestamp()
      };
      await setDoc(doc(db, 'accessRequests', user.uid), payload);
    } catch (err: any) { setAuthError('Erro ao submeter perfil.'); }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostText.trim() || !user) return;
    try {
      await addDoc(collection(db, 'posts'), {
        authorUid: user.uid,
        authorName: userProfile?.name || user.displayName || 'Utilizador',
        authorRole: userProfile?.role || 'Membro Elo',
        authorAvatar: userProfile?.avatarUrl || '',
        content: newPostText,
        imageUrl: newPostImage || null,
        timestamp: new Date().toLocaleDateString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        createdAt: serverTimestamp(),
        likes: [],
        comments: []
      });
      setNewPostText('');
      setNewPostImage(null);
      setActiveModal('none');
      showToast('Publicação criada com sucesso!');
    } catch (err) {
      showToast('Erro ao criar publicação.');
    }
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !meetingData.targetUid || !meetingData.date || !meetingData.time) return;
    const targetUser = networkUsers.find(u => u.uid === meetingData.targetUid);
    if (!targetUser) return;
    try {
      await addDoc(collection(db, 'meetings'), {
        requesterUid: user.uid,
        requesterName: userProfile?.name || 'Membro',
        targetUid: targetUser.uid,
        targetName: targetUser.name,
        message: meetingData.message,
        proposedDateTime: `${meetingData.date}T${meetingData.time}`,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setMeetingData({ targetUid: '', date: '', time: '', message: '' });
      setActiveModal('none');
      showToast('Reunião agendada com sucesso!');
    } catch (err) {
      showToast('Erro ao agendar reunião.');
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.uid !== ADMIN_UID || !eventData.title || !eventData.date || !eventData.time || !eventData.location) return;
    try {
      await addDoc(collection(db, 'events'), {
        ...eventData,
        attendees: [],
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });
      setEventData({ title: '', description: '', date: '', time: '', location: '', capacity: '' });
      setActiveModal('none');
      showToast('Evento criado com sucesso!');
    } catch (err) {
      showToast('Erro ao criar evento.');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { showToast('Imagem demasiado grande. Máximo 2MB.'); return; }
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxWidth = 1200;
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          setNewPostImage(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'avatarUrl' | 'coverUrl') => {
    const file = e.target.files?.[0];
    if (file && editFormData) {
      if (file.size > 2 * 1024 * 1024) { showToast('Imagem demasiado grande. Máximo 2MB.'); return; }
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxWidth = 800;
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          setEditFormData({ ...editFormData, [field]: canvas.toDataURL('image/jpeg', 0.7) });
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleLike = async (postId: string, currentLikes: string[]) => {
    if (!user) return;
    try {
      const postRef = doc(db, 'posts', postId);
      const hasLiked = currentLikes.includes(user.uid);
      await updateDoc(postRef, { likes: hasLiked ? arrayRemove(user.uid) : arrayUnion(user.uid) });
    } catch (err) { showToast('Erro ao atualizar gosto.'); }
  };

  const handleAddComment = async (postId: string) => {
    if (!commentInput.trim() || !user) return;
    try {
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        comments: arrayUnion({
          id: Date.now().toString(),
          authorName: userProfile?.name || 'Utilizador',
          text: commentInput,
          timestamp: new Date().toLocaleDateString('pt-PT', { hour: '2-digit', minute: '2-digit' })
        })
      });
      setCommentInput('');
    } catch (err) { showToast('Erro ao adicionar comentário.'); }
  };

  const handleShare = (postId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/#post-${postId}`);
    showToast('Link copiado para a área de transferência!');
  };

  const toggleFollow = (targetUid: string) => {
    if (followingUids.includes(targetUid)) {
      setFollowingUids(followingUids.filter(id => id !== targetUid));
      showToast('Deixaste de seguir este perfil.');
    } else {
      setFollowingUids([...followingUids, targetUid]);
      showToast('A seguir perfil.');
    }
  };

  const toggleEventRSVP = async (eventId: string, currentAttendees: string[]) => {
    if (!user) return;
    try {
      const eventRef = doc(db, 'events', eventId);
      const isAttending = currentAttendees.includes(user.uid);
      await updateDoc(eventRef, { attendees: isAttending ? arrayRemove(user.uid) : arrayUnion(user.uid) });
      showToast(isAttending ? 'Inscrição cancelada.' : 'Inscrito no evento com sucesso!');
    } catch (err) { showToast('Erro ao atualizar inscrição.'); }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editFormData) return;
    try {
      await updateDoc(doc(db, 'accessRequests', user.uid), {
        name: editFormData.name,
        role: editFormData.role,
        location: editFormData.location,
        pitch: editFormData.pitch,
        lookingFor: editFormData.lookingFor,
        linkedinUrl: editFormData.linkedinUrl || '',
        avatarUrl: editFormData.avatarUrl || '',
        coverUrl: editFormData.coverUrl || ''
      });
      setActiveModal('none');
      showToast('Perfil atualizado com sucesso!');
    } catch (err) { showToast('Erro ao atualizar perfil.'); }
  };

  const handleUpdateEmail = async () => {
    if (!user || !newEmail) return;
    setAccountSettingsMsg('');
    try {
      await updateEmail(user, newEmail);
      await updateDoc(doc(db, 'accessRequests', user.uid), { email: newEmail });
      setAccountSettingsMsg('Email atualizado com sucesso!');
      setNewEmail('');
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') setAccountSettingsMsg('Por razões de segurança, faz logout e login novamente.');
      else setAccountSettingsMsg(`Erro: ${err.message}`);
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
      if (err.code === 'auth/requires-recent-login') setAccountSettingsMsg('Por razões de segurança, faz logout e login novamente.');
      else setAccountSettingsMsg(`Erro: ${err.message}`);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !window.confirm('Eliminar permanentemente a conta?')) return;
    try {
      await deleteDoc(doc(db, 'accessRequests', user.uid));
      await deleteUser(user);
    } catch (err: any) { alert('Efetue login recente antes de eliminar a conta.'); }
  };

  const handlePrivacyToggle = async (key: 'visibleInNetwork' | 'acceptsMeetings', val: boolean) => {
    if (!user) return;
    try {
      if (key === 'visibleInNetwork') setVisibleInNetwork(val);
      if (key === 'acceptsMeetings') setAcceptsMeetings(val);
      await updateDoc(doc(db, 'accessRequests', user.uid), { [key]: val });
      showToast('Preferências de privacidade guardadas.');
    } catch (err) { showToast('Erro ao guardar privacidade.'); }
  };

  const handleAiSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    const userMsg = aiInput;
    setAiMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setAiInput('');
    setTimeout(() => {
      let reply = 'Posso otimizar a tua biografia no Elo para atrair mais investidores e fundadores relevantes.';
      if (userMsg.toLowerCase().includes('reunião')) reply = 'Garante que o teu Pitch no perfil descreve claramente a tua proposta de valor.';
      setAiMessages(prev => [...prev, { sender: 'ai', text: reply }]);
    }, 600);
  };

  const handleAdminApprove = async (targetUid: string) => {
    await updateDoc(doc(db, 'accessRequests', targetUid), { status: 'approved' });
    setPendingRequests(pendingRequests.filter(u => u.uid !== targetUid));
    showToast('Membro aprovado com sucesso.');
  };

  const handleAdminReject = async (targetUid: string) => {
    if (!window.confirm('Tem a certeza que pretende rejeitar esta candidatura?')) return;
    await updateDoc(doc(db, 'accessRequests', targetUid), { status: 'rejected' });
    setPendingRequests(pendingRequests.filter(u => u.uid !== targetUid));
    showToast('Acesso rejeitado.');
  };

  const handleAdminRevoke = async (targetUid: string) => {
    if (!window.confirm('Tem a certeza que pretende revogar o acesso a este membro?')) return;
    await updateDoc(doc(db, 'accessRequests', targetUid), { status: 'rejected' });
    setApprovedMembers(approvedMembers.filter(u => u.uid !== targetUid));
    showToast('Acesso revogado.');
  };

  const parseDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center font-sans">
        <div className="w-6 h-6 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (user) {
    if (accessStatus === 'pending') {
      return (
        <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex flex-col justify-center items-center p-8 font-sans">
          <div className="max-w-md w-full text-center space-y-6">
            <img src={logo} alt="Elo" className="mx-auto h-16 w-auto dark:invert" />
            <h1 className="text-2xl font-semibold tracking-tight">Pedido Enviado</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              O teu perfil encontra-se sob revisão. Analisamos todas as candidaturas individualmente.
            </p>
            <button onClick={handleLogout} className={`text-xs text-gray-400 hover:text-black dark:hover:text-white underline ${btnFocus}`}>Sair da conta</button>
          </div>
        </div>
      );
    }

    if (accessStatus === 'rejected') {
      return (
        <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex flex-col justify-center items-center p-8 font-sans">
          <div className="max-w-md w-full text-center space-y-6">
            <img src={logo} alt="Elo" className="mx-auto h-16 w-auto dark:invert" />
            <h1 className="text-2xl font-semibold tracking-tight">Acesso Não Aprovado</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              De momento, não nos é possível aprovar o teu acesso ao Elo.
            </p>
            <button onClick={handleLogout} className={`text-xs text-gray-400 hover:text-black dark:hover:text-white underline ${btnFocus}`}>Sair da conta</button>
          </div>
        </div>
      );
    }

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
                  <input type="text" placeholder="Nome Completo" value={onboardingData.name} onChange={e => setOnboardingData({ ...onboardingData, name: e.target.value })} required className="w-full border-b border-gray-300 dark:border-gray-800 bg-transparent py-3 text-sm focus:outline-none focus:border-black dark:focus:border-white" />
                  <input type="text" placeholder="Localização" value={onboardingData.location} onChange={e => setOnboardingData({ ...onboardingData, location: e.target.value })} required className="w-full border-b border-gray-300 dark:border-gray-800 bg-transparent py-3 text-sm focus:outline-none focus:border-black dark:focus:border-white" />
                </>
              )}
              {onboardingStep === 2 && (
                <>
                  <input type="text" placeholder="Cargo / Função" value={onboardingData.role} onChange={e => setOnboardingData({ ...onboardingData, role: e.target.value })} required className="w-full border-b border-gray-300 dark:border-gray-800 bg-transparent py-3 text-sm focus:outline-none focus:border-black dark:focus:border-white" />
                  <input type="text" placeholder="Empresa / Projeto" value={onboardingData.company} onChange={e => setOnboardingData({ ...onboardingData, company: e.target.value })} required className="w-full border-b border-gray-300 dark:border-gray-800 bg-transparent py-3 text-sm focus:outline-none focus:border-black dark:focus:border-white" />
                  <div>
                    <textarea maxLength={300} placeholder="O teu Pitch curto" value={onboardingData.pitch} onChange={e => setOnboardingData({ ...onboardingData, pitch: e.target.value })} required className="w-full border border-gray-300 dark:border-gray-800 bg-transparent p-3 rounded-lg text-sm h-24 focus:outline-none focus:border-black dark:focus:border-white" />
                    <div className="text-right text-[10px] text-gray-400">{onboardingData.pitch.length}/300</div>
                  </div>
                </>
              )}
              {onboardingStep === 3 && (
                <div>
                  <textarea maxLength={300} placeholder="O que procuras no Elo?" value={onboardingData.lookingFor} onChange={e => setOnboardingData({ ...onboardingData, lookingFor: e.target.value })} required className="w-full border border-gray-300 dark:border-gray-800 bg-transparent p-3 rounded-lg text-sm h-32 focus:outline-none focus:border-black dark:focus:border-white" />
                  <div className="text-right text-[10px] text-gray-400">{onboardingData.lookingFor.length}/300</div>
                </div>
              )}
              <div className="flex justify-between gap-4 pt-4">
                {onboardingStep > 1 && <button type="button" onClick={() => setOnboardingStep(onboardingStep - 1)} className={`w-1/2 py-3 border border-gray-300 dark:border-gray-800 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-900 ${btnFocus}`}>Voltar</button>}
                <button type="submit" className={`py-3 bg-black text-white dark:bg-white dark:text-black rounded-lg text-sm font-medium ${onboardingStep === 1 ? 'w-full' : 'w-1/2'} ${btnFocus}`}>
                  {onboardingStep === 3 ? 'Submeter Pedido' : 'Continuar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    const activeProfile = viewingProfileUid ? networkUsers.find(u => u.uid === viewingProfileUid) || userProfile : userProfile;

    return (
      <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-sans flex flex-col pb-20 md:pb-0">
        <style>{`
          @keyframes modal-fade-scale {
            0% { opacity: 0; transform: scale(0.95); }
            100% { opacity: 1; transform: scale(1); }
          }
          .animate-modal {
            animation: modal-fade-scale 150ms ease-out forwards;
          }
        `}</style>
        
        {toastMessage && <div className="fixed top-5 right-5 z-50 bg-black text-white dark:bg-white dark:text-black px-4 py-2.5 rounded-lg text-xs shadow-lg animate-modal">{toastMessage}</div>}

        <header className="border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white/80 dark:bg-black/80 backdrop-blur-md z-40">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <img src={logo} alt="Elo" className="h-8 w-auto dark:invert cursor-pointer" onClick={() => { setCurrentTab('feed'); setViewingProfileUid(null); setIsMobileMenuOpen(false); setIsCreateMenuOpen(false); }} />
              <nav className="hidden md:flex gap-6 text-sm font-medium">
                <button onClick={() => { setCurrentTab('feed'); setViewingProfileUid(null); }} className={`${currentTab === 'feed' ? 'text-black dark:text-white' : 'text-gray-400 hover:text-black dark:hover:text-white'} ${btnFocus}`}>Feed</button>
                <button onClick={() => { setCurrentTab('rede'); setViewingProfileUid(null); }} className={`${currentTab === 'rede' ? 'text-black dark:text-white' : 'text-gray-400 hover:text-black dark:hover:text-white'} ${btnFocus}`}>Rede</button>
                <button onClick={() => { setCurrentTab('notificacoes'); setViewingProfileUid(null); }} className={`${currentTab === 'notificacoes' ? 'text-black dark:text-white' : 'text-gray-400 hover:text-black dark:hover:text-white'} ${btnFocus}`}>Notificações</button>
                <button onClick={() => { setCurrentTab('perfil'); setViewingProfileUid(null); }} className={`${currentTab === 'perfil' && !viewingProfileUid ? 'text-black dark:text-white' : 'text-gray-400 hover:text-black dark:hover:text-white'} ${btnFocus}`}>Perfil</button>
              </nav>
            </div>
            
            <div className="hidden md:flex items-center gap-3">
              <div className="relative">
                <button onClick={() => setIsCreateMenuOpen(!isCreateMenuOpen)} className={`text-xs bg-black text-white dark:bg-white dark:text-black px-3 py-1.5 rounded-full flex items-center gap-1 ${btnFocus}`}>
                  <Plus size={14} /> Criar
                </button>
                {isCreateMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg flex flex-col p-2 gap-1 z-50 animate-modal">
                    <button onClick={() => {setActiveModal('createPost'); setIsCreateMenuOpen(false);}} className={`text-left text-sm px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 ${btnFocus}`}>Nova Publicação</button>
                    <button onClick={() => {setActiveModal('createMeeting'); setIsCreateMenuOpen(false);}} className={`text-left text-sm px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 ${btnFocus}`}>Agendar Reunião</button>
                    {user?.uid === ADMIN_UID && (
                      <button onClick={() => {setActiveModal('createEvent'); setIsCreateMenuOpen(false);}} className={`text-left text-sm px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 ${btnFocus}`}>Criar Evento</button>
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => setActiveModal('ai')} className={`text-xs border border-gray-300 dark:border-gray-800 px-3 py-1.5 rounded-full hover:border-black dark:hover:border-white ${btnFocus}`}>Elo AI</button>
              <button onClick={() => setActiveModal('planos')} className={`text-xs bg-gray-100 dark:bg-gray-900 text-black dark:text-white px-3 py-1.5 rounded-full ${btnFocus}`}>Pro</button>
              <button onClick={() => setActiveModal('settings')} className={`text-xs text-gray-400 hover:text-black dark:hover:text-white ${btnFocus}`}>Definições</button>
              {user.uid === ADMIN_UID && <button onClick={() => setActiveModal('admin')} className={`text-xs border border-gray-400 px-2 py-1 rounded ${btnFocus}`}>Admin</button>}
              <button onClick={handleLogout} className={`text-xs text-gray-400 hover:text-black dark:hover:text-white ${btnFocus}`}>Sair</button>
            </div>

            <div className="md:hidden relative flex items-center gap-2">
              <button onClick={() => setIsCreateMenuOpen(!isCreateMenuOpen)} className={`text-xs bg-black text-white dark:bg-white dark:text-black px-3 py-1.5 rounded-full flex items-center gap-1 ${btnFocus}`}>
                <Plus size={14} /> Criar
              </button>
              {isCreateMenuOpen && (
                <div className="absolute right-10 top-10 mt-2 w-48 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg flex flex-col p-2 gap-1 z-50 animate-modal">
                  <button onClick={() => {setActiveModal('createPost'); setIsCreateMenuOpen(false);}} className={`text-left text-sm px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 ${btnFocus}`}>Nova Publicação</button>
                  <button onClick={() => {setActiveModal('createMeeting'); setIsCreateMenuOpen(false);}} className={`text-left text-sm px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 ${btnFocus}`}>Agendar Reunião</button>
                  {user?.uid === ADMIN_UID && (
                    <button onClick={() => {setActiveModal('createEvent'); setIsCreateMenuOpen(false);}} className={`text-left text-sm px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 ${btnFocus}`}>Criar Evento</button>
                  )}
                </div>
              )}
              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className={`p-2 text-gray-600 dark:text-gray-300 ${btnFocus}`}>
                {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              {isMobileMenuOpen && (
                <div className="absolute right-0 top-10 mt-2 w-48 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg flex flex-col p-2 gap-1 z-50 animate-modal">
                  <button onClick={() => {setActiveModal('ai'); setIsMobileMenuOpen(false);}} className={`text-left text-sm px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 ${btnFocus}`}>Elo AI</button>
                  <button onClick={() => {setActiveModal('planos'); setIsMobileMenuOpen(false);}} className={`text-left text-sm px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 ${btnFocus}`}>Pro</button>
                  <button onClick={() => {setActiveModal('settings'); setIsMobileMenuOpen(false);}} className={`text-left text-sm px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 ${btnFocus}`}>Definições</button>
                  {user.uid === ADMIN_UID && (
                    <button onClick={() => {setActiveModal('admin'); setIsMobileMenuOpen(false);}} className={`text-left text-sm px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 ${btnFocus}`}>Admin</button>
                  )}
                  <button onClick={() => {handleLogout(); setIsMobileMenuOpen(false);}} className={`text-left text-sm px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 text-red-500 ${btnFocus}`}>Sair</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-10 flex-1 w-full" onClick={() => { isMobileMenuOpen && setIsMobileMenuOpen(false); isCreateMenuOpen && setIsCreateMenuOpen(false); }}>
          {currentTab === 'feed' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              <div className="md:col-span-2 space-y-8">
                <button 
                  onClick={() => setActiveModal('createPost')}
                  className={`w-full flex items-center gap-4 border border-gray-200 dark:border-gray-800 p-4 rounded-2xl cursor-pointer hover:border-black dark:hover:border-white transition-colors text-left ${btnFocus}`}
                >
                  <div className="w-12 h-12 bg-gray-100 dark:bg-gray-900 rounded-full flex items-center justify-center shrink-0 overflow-hidden relative">
                    <span className="absolute">{userProfile?.name?.charAt(0) || 'U'}</span>
                    {userProfile?.avatarUrl && <img src={userProfile.avatarUrl} alt="" className="w-full h-full object-cover relative z-10" onError={handleImageError} />}
                  </div>
                  <div className="text-sm text-gray-400">Criar uma publicação...</div>
                </button>

                {fetchingPosts ? (
                  <div className="space-y-8">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="animate-pulse bg-gray-100 dark:bg-gray-900/50 h-48 rounded-2xl w-full border border-gray-200 dark:border-gray-800" />
                    ))}
                  </div>
                ) : posts.length === 0 ? (
                  <div className="py-16 flex flex-col items-center justify-center text-gray-400 space-y-4 text-center">
                    <Inbox size={48} className="opacity-20" />
                    <p className="text-sm">Ainda não há publicações.<br />Sê o primeiro a partilhar algo.</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {posts.map(post => (
                      <article key={post.id} className="border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-900 rounded-full flex items-center justify-center font-bold text-sm uppercase shrink-0 overflow-hidden relative">
                              <span className="absolute">{post.authorName.charAt(0)}</span>
                              {post.authorAvatar && <img src={post.authorAvatar} alt="" className="w-full h-full object-cover relative z-10" onError={handleImageError} />}
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{post.authorName}</p>
                              <p className="text-xs text-gray-500">{post.authorRole}</p>
                            </div>
                          </div>
                          <span className="text-xs text-gray-400">{post.timestamp}</span>
                        </div>

                        <p className="text-sm leading-relaxed mb-4 whitespace-pre-wrap">{post.content}</p>
                        {post.imageUrl && <img src={post.imageUrl} alt="" className="rounded-xl w-full max-h-96 object-cover border border-gray-100 dark:border-gray-900 mb-4" onError={handleImageError} />}

                        <div className="flex items-center gap-8 text-xs text-gray-500 pt-4 mt-2 border-t border-gray-100 dark:border-gray-900">
                          <button onClick={() => toggleLike(post.id, post.likes)} className={`flex items-center gap-2 hover:text-black dark:hover:text-white transition-colors ${post.likes.includes(user.uid) ? 'font-bold text-black dark:text-white' : ''} ${btnFocus}`}>
                            <ThumbsUp size={16} /> Gostar ({post.likes.length})
                          </button>
                          <button onClick={() => setActiveCommentPostId(activeCommentPostId === post.id ? null : post.id)} className={`flex items-center gap-2 hover:text-black dark:hover:text-white transition-colors ${btnFocus}`}>
                            <MessageCircle size={16} /> Comentar ({post.comments.length})
                          </button>
                          <button onClick={() => handleShare(post.id)} className={`flex items-center gap-2 hover:text-black dark:hover:text-white transition-colors ${btnFocus}`}>
                            <Share2 size={16} /> Partilhar
                          </button>
                        </div>

                        {activeCommentPostId === post.id && (
                          <div className="pt-5 mt-5 border-t border-gray-100 dark:border-gray-900 space-y-4">
                            <div className="flex gap-3">
                              <input maxLength={500} type="text" placeholder="Escreve um comentário..." value={commentInput} onChange={e => setCommentInput(e.target.value)} className="flex-1 border border-gray-200 dark:border-gray-800 bg-transparent px-4 py-2 rounded-xl text-sm focus:outline-none focus:border-black dark:focus:border-white" />
                              <button onClick={() => handleAddComment(post.id)} className={`bg-black text-white dark:bg-white dark:text-black px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center ${btnFocus}`}>
                                <Send size={16} />
                              </button>
                            </div>
                            <div className="text-right text-[10px] text-gray-400 pr-16">{commentInput.length}/500</div>
                            <div className="space-y-3">
                              {post.comments.map(c => (
                                <div key={c.id} className="bg-gray-50 dark:bg-gray-900 p-3 rounded-xl text-sm space-y-1">
                                  <div className="flex justify-between items-baseline">
                                    <span className="font-semibold text-xs">{c.authorName}</span>
                                    <span className="text-[10px] text-gray-400">{c.timestamp}</span>
                                  </div>
                                  <p className="text-gray-700 dark:text-gray-300 text-xs">{c.text}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-8">
                {events.length > 0 && (
                  <div className="border border-gray-200 dark:border-gray-800 rounded-2xl p-6 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><Calendar size={14}/> Próximos Eventos</h3>
                    <div className="space-y-5">
                      {events.map(ev => (
                        <div key={ev.id} className="border-b border-gray-100 dark:border-gray-900 pb-4 last:border-0 last:pb-0 space-y-2">
                          <h4 className="font-semibold text-sm leading-tight">{ev.title}</h4>
                          <div className="text-xs text-gray-500 space-y-1">
                            <p>{ev.date} às {ev.time}</p>
                            <p className="flex items-center gap-1"><MapPin size={12}/> {ev.location}</p>
                          </div>
                          <button onClick={() => toggleEventRSVP(ev.id, ev.attendees)} className={`w-full mt-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${ev.attendees.includes(user.uid) ? 'bg-gray-100 dark:bg-gray-800 text-black dark:text-white' : 'bg-black text-white dark:bg-white dark:text-black'} ${btnFocus}`}>
                            {ev.attendees.includes(user.uid) ? 'Inscrito ✓' : 'Inscrever-me'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border border-gray-200 dark:border-gray-800 rounded-2xl p-6 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Radar de Mercado</h3>
                  {rssLoading && <p className="text-xs text-gray-400">A carregar notícias...</p>}
                  {rssError && <p className="text-xs text-gray-400">Não foi possível carregar o feed.</p>}
                  {!rssLoading && !rssError && (
                    <ul className="space-y-4">
                      {rssNews.map((news, idx) => (
                        <li key={idx} className="border-b border-gray-100 dark:border-gray-900 pb-3 last:border-0 last:pb-0">
                          <a href={news.link} target="_blank" rel="noopener noreferrer" className={`text-sm font-medium hover:underline line-clamp-2 leading-snug rounded-sm ${btnFocus}`}>
                            {news.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="border border-gray-200 dark:border-gray-800 rounded-2xl p-6 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Dica do Mês</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    Mantém o teu perfil atualizado com objetivos claros. Mencionares exatamente o tipo de apoio que procuras duplica a taxa de resposta a pedidos de reunião.
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentTab === 'rede' && (
            <div className="space-y-6">
              <input type="text" placeholder="Pesquisar por nome, cargo ou localização..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-4 rounded-xl text-sm focus:outline-none focus:border-black dark:focus:border-white" />
              
              {fetchingNetwork ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="animate-pulse bg-gray-100 dark:bg-gray-900/50 h-40 rounded-2xl w-full border border-gray-200 dark:border-gray-800" />
                  ))}
                </div>
              ) : networkUsers.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-gray-400 space-y-4 text-center">
                  <Users size={48} className="opacity-20" />
                  <p className="text-sm">Ainda não há outros membros na rede.<br />Volta em breve.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {networkUsers.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.role.toLowerCase().includes(searchTerm.toLowerCase()) || u.location.toLowerCase().includes(searchTerm.toLowerCase())).map(netUser => (
                    <div key={netUser.uid} className="border border-gray-200 dark:border-gray-800 rounded-2xl p-6 flex flex-col justify-between space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-900 rounded-full flex items-center justify-center font-bold text-sm uppercase shrink-0 overflow-hidden relative">
                          <span className="absolute">{netUser.name.charAt(0)}</span>
                          {netUser.avatarUrl && <img src={netUser.avatarUrl} alt="" className="w-full h-full object-cover relative z-10" onError={handleImageError} />}
                        </div>
                        <div className="space-y-1 text-sm">
                          <h4 className="font-semibold">{netUser.name}</h4>
                          <p className="text-xs text-gray-500">{netUser.role} • {netUser.location}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-2">{netUser.pitch}</p>
                          {netUser.lookingFor && <span className="inline-block mt-2 text-[10px] border border-gray-300 dark:border-gray-700 px-2.5 py-1 rounded-full text-gray-600 dark:text-gray-300">Procura: {netUser.lookingFor}</span>}
                        </div>
                      </div>
                      <div className="flex gap-3 pt-4 mt-2 border-t border-gray-100 dark:border-gray-900">
                        <button onClick={() => { setViewingProfileUid(netUser.uid); setCurrentTab('perfil'); }} className={`flex-1 py-2 border border-gray-200 dark:border-gray-800 rounded-xl text-xs hover:border-black dark:hover:border-white transition-colors ${btnFocus}`}>Ver Perfil</button>
                        <button onClick={() => toggleFollow(netUser.uid)} className={`flex-1 py-2 bg-black text-white dark:bg-white dark:text-black rounded-xl text-xs font-medium ${btnFocus}`}>{followingUids.includes(netUser.uid) ? 'A seguir' : 'Seguir'}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentTab === 'notificacoes' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-lg font-semibold">Notificações</h2>
                <button onClick={() => setNotifications(notifications.map(n => ({ ...n, read: true })))} className={`text-xs text-gray-500 hover:text-black dark:hover:text-white ${btnFocus}`}>Marcar todas como lidas</button>
              </div>
              
              {notifications.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-gray-400 space-y-4 text-center">
                  <Bell size={48} className="opacity-20" />
                  <p className="text-sm">Sem notificações por agora.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map(n => (
                    <div key={n.id} className={`p-4 rounded-xl border flex items-center justify-between ${n.read ? 'border-gray-100 dark:border-gray-900 opacity-60' : 'border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50'}`}>
                      <p className="text-sm">{n.text}</p>
                      <span className="text-[10px] text-gray-400">{n.timestamp}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentTab === 'perfil' && activeProfile && (
            <div className="max-w-3xl mx-auto space-y-8">
              <div className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                <div className="h-48 bg-gray-100 dark:bg-gray-900 relative">
                  {activeProfile.coverUrl && <img src={activeProfile.coverUrl} alt="" className="w-full h-full object-cover" onError={handleImageError} />}
                </div>
                <div className="p-8 relative pt-0">
                  <div className="w-24 h-24 bg-gray-100 dark:bg-gray-900 rounded-full border-4 border-white dark:border-black flex items-center justify-center font-bold text-2xl uppercase -mt-12 mb-4 shrink-0 overflow-hidden relative">
                    <span className="absolute">{activeProfile.name.charAt(0)}</span>
                    {activeProfile.avatarUrl && <img src={activeProfile.avatarUrl} alt="" className="w-full h-full object-cover relative z-10" onError={handleImageError} />}
                  </div>
                  <div className="flex flex-col md:flex-row md:justify-between items-start mb-6 gap-4">
                    <div className="space-y-1">
                      <h2 className="text-2xl font-bold">{activeProfile.name}</h2>
                      <p className="text-sm text-gray-500">{activeProfile.role} • {activeProfile.location}</p>
                      <p className="text-xs text-gray-400 pt-1">
                        {activeProfilePostCount !== null ? `${activeProfilePostCount} Publicaç${activeProfilePostCount === 1 ? 'ão' : 'ões'} • ` : ''} 
                        Membro desde {parseDate(activeProfile.createdAt)}
                      </p>
                    </div>
                    {!viewingProfileUid || viewingProfileUid === user.uid ? (
                      <button onClick={() => { setSettingsTab('perfil'); setActiveModal('settings'); }} className={`text-xs border border-gray-300 dark:border-gray-700 px-4 py-2 rounded-xl hover:border-black dark:hover:border-white transition-colors ${btnFocus}`}>Editar Perfil</button>
                    ) : (
                      <div className="flex gap-3 w-full md:w-auto">
                        <button onClick={() => { setMeetingData({ targetUid: activeProfile.uid, date: '', time: '', message: '' }); setActiveModal('createMeeting'); }} className={`flex-1 md:flex-none text-xs bg-black text-white dark:bg-white dark:text-black px-4 py-2 rounded-xl font-medium ${btnFocus}`}>Reunião</button>
                        <button onClick={() => toggleFollow(activeProfile.uid)} className={`flex-1 md:flex-none text-xs border border-gray-300 dark:border-gray-700 px-4 py-2 rounded-xl ${btnFocus}`}>{followingUids.includes(activeProfile.uid) ? 'A seguir' : 'Seguir'}</button>
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm pt-4 border-t border-gray-100 dark:border-gray-900">
                    <div>
                      <h4 className="font-bold uppercase text-gray-400 text-[10px] tracking-wider mb-2">Pitch / Sobre</h4>
                      <p className="leading-relaxed whitespace-pre-wrap">{activeProfile.pitch}</p>
                    </div>
                    <div className="space-y-6">
                      {activeProfile.lookingFor && (
                        <div>
                          <h4 className="font-bold uppercase text-gray-400 text-[10px] tracking-wider mb-2">O que procura</h4>
                          <p className="leading-relaxed whitespace-pre-wrap">{activeProfile.lookingFor}</p>
                        </div>
                      )}
                      {activeProfile.linkedinUrl && (
                        <div>
                          <a href={activeProfile.linkedinUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2 bg-gray-100 dark:bg-gray-900 px-4 py-2 rounded-full text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors ${btnFocus}`}>
                            <ExternalLink size={14} /> LinkedIn
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800 flex justify-around py-3 text-xs z-40">
          <button onClick={() => { setCurrentTab('feed'); setViewingProfileUid(null); setIsMobileMenuOpen(false); setIsCreateMenuOpen(false); }} className={`${currentTab === 'feed' ? 'font-bold' : 'text-gray-400'} ${btnFocus} p-2`}>Feed</button>
          <button onClick={() => { setCurrentTab('rede'); setViewingProfileUid(null); setIsMobileMenuOpen(false); setIsCreateMenuOpen(false); }} className={`${currentTab === 'rede' ? 'font-bold' : 'text-gray-400'} ${btnFocus} p-2`}>Rede</button>
          <button onClick={() => { setCurrentTab('notificacoes'); setViewingProfileUid(null); setIsMobileMenuOpen(false); setIsCreateMenuOpen(false); }} className={`${currentTab === 'notificacoes' ? 'font-bold' : 'text-gray-400'} ${btnFocus} p-2`}>Notificações</button>
          <button onClick={() => { setCurrentTab('perfil'); setViewingProfileUid(null); setIsMobileMenuOpen(false); setIsCreateMenuOpen(false); }} className={`${currentTab === 'perfil' && !viewingProfileUid ? 'font-bold' : 'text-gray-400'} ${btnFocus} p-2`}>Perfil</button>
        </nav>

        {activeModal === 'createPost' && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-lg w-full space-y-4 animate-modal">
              <h3 className="text-base font-semibold">Nova Publicação</h3>
              <form onSubmit={handleCreatePost} className="space-y-4">
                <div>
                  <textarea maxLength={500} placeholder="O que queres partilhar com a rede?" value={newPostText} onChange={e => setNewPostText(e.target.value)} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-4 rounded-xl text-sm h-32 focus:outline-none focus:border-black dark:focus:border-white" />
                  <div className="text-right text-[10px] text-gray-400">{newPostText.length}/500</div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer border border-gray-200 dark:border-gray-800 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors focus-within:ring-2 focus-within:ring-black dark:focus-within:ring-white">
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    <ImageIcon size={20} className="text-gray-500" />
                  </label>
                  {newPostImage && <span className="text-xs text-gray-500">Imagem anexada pronta a publicar.</span>}
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setActiveModal('none')} className={`px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl text-xs ${btnFocus}`}>Cancelar</button>
                  <button type="submit" className={`px-4 py-2.5 bg-black text-white dark:bg-white dark:text-black rounded-xl text-xs font-medium ${btnFocus}`}>Publicar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeModal === 'createMeeting' && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-lg w-full space-y-4 animate-modal">
              <h3 className="text-base font-semibold">Agendar Reunião</h3>
              <form onSubmit={handleCreateMeeting} className="space-y-4 text-sm">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">Com quem?</label>
                  <select required value={meetingData.targetUid} onChange={e => setMeetingData({...meetingData, targetUid: e.target.value})} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-3 rounded-xl focus:outline-none focus:border-black dark:focus:border-white">
                    <option value="" disabled className="text-gray-400 dark:bg-black">Seleciona um membro da rede</option>
                    {networkUsers.map(u => <option key={u.uid} value={u.uid} className="dark:bg-black">{u.name} ({u.role})</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500">Data</label>
                    <input type="date" required value={meetingData.date} onChange={e => setMeetingData({...meetingData, date: e.target.value})} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-3 rounded-xl focus:outline-none focus:border-black dark:focus:border-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500">Hora</label>
                    <input type="time" required value={meetingData.time} onChange={e => setMeetingData({...meetingData, time: e.target.value})} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-3 rounded-xl focus:outline-none focus:border-black dark:focus:border-white" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">Mensagem Curta</label>
                  <textarea maxLength={200} placeholder="Propósito da reunião..." value={meetingData.message} onChange={e => setMeetingData({...meetingData, message: e.target.value})} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-3 rounded-xl h-20 focus:outline-none focus:border-black dark:focus:border-white" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setActiveModal('none')} className={`px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl text-xs ${btnFocus}`}>Cancelar</button>
                  <button type="submit" className={`px-4 py-2.5 bg-black text-white dark:bg-white dark:text-black rounded-xl text-xs font-medium ${btnFocus}`}>Agendar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeModal === 'createEvent' && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-lg w-full space-y-4 animate-modal">
              <h3 className="text-base font-semibold">Criar Novo Evento (Admin)</h3>
              <form onSubmit={handleCreateEvent} className="space-y-4 text-sm">
                <input type="text" required placeholder="Título do Evento" value={eventData.title} onChange={e => setEventData({...eventData, title: e.target.value})} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-3 rounded-xl focus:outline-none focus:border-black dark:focus:border-white" />
                <textarea required placeholder="Descrição" value={eventData.description} onChange={e => setEventData({...eventData, description: e.target.value})} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-3 rounded-xl h-20 focus:outline-none focus:border-black dark:focus:border-white" />
                <div className="grid grid-cols-2 gap-4">
                  <input type="date" required value={eventData.date} onChange={e => setEventData({...eventData, date: e.target.value})} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-3 rounded-xl focus:outline-none focus:border-black dark:focus:border-white" />
                  <input type="time" required value={eventData.time} onChange={e => setEventData({...eventData, time: e.target.value})} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-3 rounded-xl focus:outline-none focus:border-black dark:focus:border-white" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <input type="text" required placeholder="Local ou Link" value={eventData.location} onChange={e => setEventData({...eventData, location: e.target.value})} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-3 rounded-xl focus:outline-none focus:border-black dark:focus:border-white" />
                  <input type="number" placeholder="Capacidade (opcional)" value={eventData.capacity} onChange={e => setEventData({...eventData, capacity: e.target.value})} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-3 rounded-xl focus:outline-none focus:border-black dark:focus:border-white" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setActiveModal('none')} className={`px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl text-xs ${btnFocus}`}>Cancelar</button>
                  <button type="submit" className={`px-4 py-2.5 bg-black text-white dark:bg-white dark:text-black rounded-xl text-xs font-medium ${btnFocus}`}>Criar Evento</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeModal === 'settings' && editFormData && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl p-0 w-full max-w-3xl flex flex-col md:flex-row max-h-[90vh] animate-modal overflow-hidden">
              
              <div className="md:w-48 bg-gray-50 dark:bg-gray-900 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800 p-4 shrink-0 overflow-x-auto md:overflow-y-auto">
                <div className="flex justify-between items-center mb-6 hidden md:flex">
                  <h3 className="text-lg font-semibold">Definições</h3>
                </div>
                <div className="flex md:flex-col gap-2 min-w-max md:min-w-0">
                  <button onClick={() => setSettingsTab('aparencia')} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${settingsTab === 'aparencia' ? 'bg-white dark:bg-black shadow-sm font-semibold' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800'} ${btnFocus}`}>
                    <Palette size={16}/> Aparência
                  </button>
                  <button onClick={() => setSettingsTab('conta')} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${settingsTab === 'conta' ? 'bg-white dark:bg-black shadow-sm font-semibold' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800'} ${btnFocus}`}>
                    <UserIcon size={16}/> Conta
                  </button>
                  <button onClick={() => setSettingsTab('privacidade')} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${settingsTab === 'privacidade' ? 'bg-white dark:bg-black shadow-sm font-semibold' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800'} ${btnFocus}`}>
                    <Shield size={16}/> Privacidade
                  </button>
                  <button onClick={() => setSettingsTab('notificacoes')} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${settingsTab === 'notificacoes' ? 'bg-white dark:bg-black shadow-sm font-semibold' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800'} ${btnFocus}`}>
                    <Bell size={16}/> Notificações
                  </button>
                  <button onClick={() => setSettingsTab('perfil')} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${settingsTab === 'perfil' ? 'bg-white dark:bg-black shadow-sm font-semibold' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800'} ${btnFocus}`}>
                    <Pencil size={16}/> Editar Perfil
                  </button>
                </div>
              </div>

              <div className="flex-1 p-6 md:p-8 overflow-y-auto">
                <div className="flex justify-between items-center mb-6 md:hidden">
                  <h3 className="text-lg font-semibold">Definições</h3>
                  <button onClick={() => setActiveModal('none')} className={`text-xs text-gray-500 hover:text-black dark:hover:text-white ${btnFocus} p-1`}>Fechar</button>
                </div>
                <div className="hidden md:flex justify-end mb-4 -mt-4 -mr-4">
                  <button onClick={() => setActiveModal('none')} className={`text-xs text-gray-500 hover:text-black dark:hover:text-white ${btnFocus} p-2`}><X size={20}/></button>
                </div>

                {settingsTab === 'aparencia' && (
                  <div className="flex items-center justify-between text-sm py-4">
                    <span>Modo Escuro</span>
                    <button onClick={() => setIsDarkMode(!isDarkMode)} className={`border border-gray-300 dark:border-gray-700 px-4 py-2 rounded-xl text-xs ${btnFocus}`}>{isDarkMode ? 'Ativo' : 'Inativo'}</button>
                  </div>
                )}

                {settingsTab === 'conta' && (
                  <div className="space-y-6 text-sm py-2">
                    {accountSettingsMsg && <p className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">{accountSettingsMsg}</p>}
                    <div className="space-y-3">
                      <p className="font-semibold">Alterar Email</p>
                      <input type="email" placeholder="Novo email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-3 rounded-xl focus:outline-none focus:border-black dark:focus:border-white" />
                      <button onClick={handleUpdateEmail} className={`px-4 py-2.5 bg-black text-white dark:bg-white dark:text-black rounded-xl text-xs font-medium ${btnFocus}`}>Atualizar Email</button>
                    </div>
                    <div className="space-y-3 pt-6 border-t border-gray-100 dark:border-gray-900">
                      <p className="font-semibold">Alterar Palavra-passe</p>
                      <input type="password" placeholder="Nova palavra-passe" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full border border-gray-200 dark:border-gray-800 bg-transparent p-3 rounded-xl focus:outline-none focus:border-black dark:focus:border-white" />
                      <button onClick={handleUpdatePassword} className={`px-4 py-2.5 bg-black text-white dark:bg-white dark:text-black rounded-xl text-xs font-medium ${btnFocus}`}>Atualizar Palavra-passe</button>
                    </div>
                    <div className="pt-6 border-t border-gray-100 dark:border-gray-900">
                      <button onClick={handleDeleteAccount} className={`text-red-500 font-medium hover:underline text-xs ${btnFocus} rounded-sm`}>Eliminar Conta Definitivamente</button>
                    </div>
                  </div>
                )}

                {settingsTab === 'privacidade' && (
                  <div className="space-y-6 text-sm py-2">
                    <div className="flex items-center justify-between">
                      <span>Perfil visível na Rede</span>
                      <button onClick={() => handlePrivacyToggle('visibleInNetwork', !visibleInNetwork)} className={`border border-gray-300 dark:border-gray-700 px-4 py-2 rounded-xl text-xs ${btnFocus}`}>{visibleInNetwork ? 'Sim' : 'Não'}</button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Aceitar pedidos de reunião</span>
                      <button onClick={() => handlePrivacyToggle('acceptsMeetings', !acceptsMeetings)} className={`border border-gray-300 dark:border-gray-700 px-4 py-2 rounded-xl text-xs ${btnFocus}`}>{acceptsMeetings ? 'Sim' : 'Não'}</button>
                    </div>
                  </div>
                )}

                {settingsTab === 'notificacoes' && (
                  <div className="space-y-6 text-sm py-2">
                    <div className="flex items-center justify-between">
                      <span>Notificar em novos seguidores</span>
                      <button onClick={() => { const v = !notifFollowers; setNotifFollowers(v); localStorage.setItem('elo_notif_followers', String(v)); }} className={`border border-gray-300 dark:border-gray-700 px-4 py-2 rounded-xl text-xs ${btnFocus}`}>{notifFollowers ? 'Sim' : 'Não'}</button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Notificar em pedidos de reunião</span>
                      <button onClick={() => { const v = !notifMeetings; setNotifMeetings(v); localStorage.setItem('elo_notif_meetings', String(v)); }} className={`border border-gray-300 dark:border-gray-700 px-4 py-2 rounded-xl text-xs ${btnFocus}`}>{notifMeetings ? 'Sim' : 'Não'}</button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-4 italic">Nota: As notificações por email ainda não estão ativas na plataforma.</p>
                  </div>
                )}

                {settingsTab === 'perfil' && (
                  <form onSubmit={handleUpdateProfile} className="space-y-8 text-sm">
                    
                    <div className="space-y-4 relative">
                      <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-xl relative group overflow-hidden border border-gray-200 dark:border-gray-700">
                        {editFormData.coverUrl && <img src={editFormData.coverUrl} className="w-full h-full object-cover" alt="Cover" />}
                        <label className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                          <span className="text-xs font-semibold flex items-center gap-2"><Camera size={16}/> Alterar capa</span>
                          <input type="file" accept="image/*" onChange={e => handleFileChange(e, 'coverUrl')} className="hidden" />
                        </label>
                      </div>
                      <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-full border-4 border-white dark:border-black absolute -bottom-6 left-6 flex items-center justify-center font-bold text-xl uppercase overflow-hidden relative group">
                        <span className="absolute z-0">{editFormData.name.charAt(0)}</span>
                        {editFormData.avatarUrl && <img src={editFormData.avatarUrl} className="w-full h-full object-cover relative z-10" alt="Avatar" />}
                        <label className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-20">
                          <Camera size={20} />
                          <input type="file" accept="image/*" onChange={e => handleFileChange(e, 'avatarUrl')} className="hidden" />
                        </label>
                      </div>
                    </div>

                    <div className="pt-6 space-y-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pb-1 border-b border-gray-100 dark:border-gray-900">Informação Básica</h4>
                      <input type="text" placeholder="Nome" value={editFormData.name} onChange={e => setEditFormData({ ...editFormData, name: e.target.value })} required className="w-full border p-3 rounded-xl bg-transparent border-gray-200 dark:border-gray-800 focus:outline-none focus:border-black dark:focus:border-white" />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <input type="text" placeholder="Cargo" value={editFormData.role} onChange={e => setEditFormData({ ...editFormData, role: e.target.value })} required className="w-full border p-3 rounded-xl bg-transparent border-gray-200 dark:border-gray-800 focus:outline-none focus:border-black dark:focus:border-white" />
                        <input type="text" placeholder="Localização" value={editFormData.location} onChange={e => setEditFormData({ ...editFormData, location: e.target.value })} required className="w-full border p-3 rounded-xl bg-transparent border-gray-200 dark:border-gray-800 focus:outline-none focus:border-black dark:focus:border-white" />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pb-1 border-b border-gray-100 dark:border-gray-900">Sobre Ti</h4>
                      <div>
                        <textarea maxLength={300} placeholder="O teu Pitch curto" value={editFormData.pitch} onChange={e => setEditFormData({ ...editFormData, pitch: e.target.value })} required className="w-full border p-3 rounded-xl bg-transparent border-gray-200 dark:border-gray-800 h-24 focus:outline-none focus:border-black dark:focus:border-white" />
                        <div className="text-right text-[10px] text-gray-400">{editFormData.pitch.length}/300</div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pb-1 border-b border-gray-100 dark:border-gray-900">Objetivos</h4>
                      <div>
                        <textarea maxLength={300} placeholder="O que procuras no Elo?" value={editFormData.lookingFor || ''} onChange={e => setEditFormData({ ...editFormData, lookingFor: e.target.value })} className="w-full border p-3 rounded-xl bg-transparent border-gray-200 dark:border-gray-800 h-24 focus:outline-none focus:border-black dark:focus:border-white" />
                        <div className="text-right text-[10px] text-gray-400">{(editFormData.lookingFor || '').length}/300</div>
                      </div>
                      <input type="url" placeholder="URL do LinkedIn" value={editFormData.linkedinUrl || ''} onChange={e => setEditFormData({ ...editFormData, linkedinUrl: e.target.value })} className="w-full border p-3 rounded-xl bg-transparent border-gray-200 dark:border-gray-800 focus:outline-none focus:border-black dark:focus:border-white" />
                    </div>
                    
                    <div className="pt-2">
                      <button type="submit" className={`w-full py-3 bg-black text-white dark:bg-white dark:text-black rounded-xl font-medium ${btnFocus}`}>Guardar Alterações</button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {activeModal === 'planos' && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl p-8 max-w-sm w-full space-y-6 text-center animate-modal">
              <h3 className="text-lg font-bold">Conta Pro Ativa</h3>
              <p className="text-sm text-gray-500 leading-relaxed">A tua conta tem acesso Pro total e ilimitado incluído na aprovação da comunidade.</p>
              <button onClick={() => setActiveModal('none')} className={`w-full py-3 bg-black text-white dark:bg-white dark:text-black rounded-xl text-sm font-medium ${btnFocus}`}>Entendido</button>
            </div>
          </div>
        )}

        {activeModal === 'ai' && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-md w-full space-y-4 flex flex-col h-[500px] animate-modal">
              <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 pb-3">
                <h3 className="text-sm font-semibold">Assistente Elo AI</h3>
                <button onClick={() => setActiveModal('none')} className={`text-xs text-gray-400 ${btnFocus} p-1 rounded-sm`}>Fechar</button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 text-sm p-2">
                {aiMessages.map((m, idx) => (
                  <div key={idx} className={`p-4 rounded-2xl max-w-[85%] leading-relaxed ${m.sender === 'user' ? 'bg-black text-white dark:bg-white dark:text-black ml-auto rounded-tr-sm' : 'bg-gray-100 dark:bg-gray-900 text-black dark:text-white rounded-tl-sm'}`}>
                    {m.text}
                  </div>
                ))}
              </div>
              <form onSubmit={handleAiSend} className="flex gap-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                <input type="text" placeholder="Pergunta à AI..." value={aiInput} onChange={e => setAiInput(e.target.value)} className="flex-1 border border-gray-200 dark:border-gray-800 bg-transparent px-4 py-3 rounded-xl text-sm focus:outline-none focus:border-black dark:focus:border-white" />
                <button type="submit" className={`bg-black text-white dark:bg-white dark:text-black px-4 py-3 rounded-xl text-sm font-medium ${btnFocus}`}><Send size={18} /></button>
              </form>
            </div>
          </div>
        )}

        {activeModal === 'admin' && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-2xl w-full space-y-6 max-h-[85vh] overflow-y-auto animate-modal">
              <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 pb-3">
                <h3 className="text-base font-semibold">Painel de Administração</h3>
                <button onClick={() => setActiveModal('none')} className={`text-xs text-gray-400 hover:text-black dark:hover:text-white transition-colors ${btnFocus} p-1 rounded-sm`}>Fechar</button>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase text-gray-400 tracking-wider">Pedidos Pendentes ({pendingRequests.length})</h4>
                {pendingRequests.length === 0 ? <p className="text-sm text-gray-500">Sem pedidos pendentes no momento.</p> : (
                  <div className="space-y-3">
                    {pendingRequests.map(req => (
                      <div key={req.uid} className="border border-gray-200 dark:border-gray-800 p-4 rounded-xl text-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="space-y-1">
                          <p className="font-semibold">{req.name} <span className="text-xs text-gray-500 font-normal">({req.email})</span></p>
                          <p className="text-xs text-gray-500">{req.role} • {req.location}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleAdminApprove(req.uid)} className={`px-3 py-1.5 bg-black text-white dark:bg-white dark:text-black rounded-lg text-xs font-medium ${btnFocus}`}>Aprovar</button>
                          <button onClick={() => handleAdminReject(req.uid)} className={`px-3 py-1.5 border border-red-500 text-red-500 rounded-lg text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950 transition-colors ${btnFocus}`}>Rejeitar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-6 border-t border-gray-100 dark:border-gray-900">
                <h4 className="text-xs font-bold uppercase text-gray-400 tracking-wider">Membros Ativos ({approvedMembers.length})</h4>
                <div className="space-y-3">
                  {approvedMembers.map(memb => (
                    <div key={memb.uid} className="border border-gray-100 dark:border-gray-900 p-4 rounded-xl text-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="space-y-1">
                        <p className="font-semibold">{memb.name}</p>
                        <p className="text-xs text-gray-500">{memb.email}</p>
                      </div>
                      <button onClick={() => handleAdminRevoke(memb.uid)} className={`px-3 py-1.5 text-red-500 underline text-xs hover:text-red-700 transition-colors ${btnFocus} rounded-sm`}>Revogar Acesso</button>
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

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans transition-colors duration-500">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <img src={logo} alt="Elo" className="mx-auto h-20 w-auto mb-8 dark:invert transition-all" />
        <h2 className="text-2xl font-medium tracking-tight mb-8">
          {isSignUp ? 'Criar a tua conta no Elo' : 'Bem-vindo ao Elo'}
        </h2>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-sm px-6">
        {authError && <div className="mb-6 p-4 border border-red-500/30 text-red-500 text-xs rounded-xl">{authError}</div>}
        <div className="space-y-4">
          <button onClick={handleGoogleLogin} className={`w-full flex justify-center items-center py-3.5 px-4 border border-gray-300 dark:border-gray-800 rounded-xl text-sm font-medium hover:border-black dark:hover:border-white transition-colors ${btnFocus}`}>
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
            Google
          </button>
          
          <button onClick={handleGithubLogin} className={`w-full flex justify-center items-center py-3.5 px-4 bg-black text-white dark:bg-white dark:text-black rounded-xl text-sm font-medium hover:opacity-80 transition-opacity ${btnFocus}`}>
            <svg className="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
            GitHub
          </button>
        </div>

        <div className="mt-8 mb-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-800" /></div>
            <div className="relative flex justify-center text-xs"><span className="px-4 bg-white dark:bg-black text-gray-400">ou email</span></div>
          </div>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-5">
          <input type="email" placeholder="Email" value={emailInput} onChange={e => setEmailInput(e.target.value)} required className="block w-full border-b border-gray-300 dark:border-gray-800 bg-transparent py-3 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors" />
          <input type="password" placeholder="Palavra-passe" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} required className="block w-full border-b border-gray-300 dark:border-gray-800 bg-transparent py-3 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors" />
          <div className="pt-4">
            <button type="submit" className={`w-full py-3.5 bg-black text-white dark:bg-white dark:text-black rounded-xl text-sm font-medium hover:opacity-80 transition-opacity ${btnFocus}`}>
              {isSignUp ? 'Registar' : 'Entrar'}
            </button>
          </div>
        </form>

        <div className="mt-8 text-center">
          <button onClick={() => setIsSignUp(!isSignUp)} className={`text-xs text-gray-500 hover:text-black dark:hover:text-white transition-colors ${btnFocus} rounded-sm p-1`}>
            {isSignUp ? 'Já tens conta? Entrar' : 'Não tens conta? Criar uma'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
