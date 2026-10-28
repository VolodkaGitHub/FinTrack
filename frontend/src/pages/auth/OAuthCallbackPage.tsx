import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { FullScreenLoader } from '../../components/common';

/** Повернення після входу через Google: токени FinTrack передаються у фрагменті URL. */
export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { acceptTokens } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) {
      return;
    }
    handled.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get('access');
    const refreshToken = params.get('refresh');
    window.history.replaceState(null, '', window.location.pathname);
    if (!accessToken || !refreshToken) {
      navigate('/login?error=oauth', { replace: true });
      return;
    }
    acceptTokens({ accessToken, refreshToken })
      .then(() => navigate('/', { replace: true }))
      .catch(() => navigate('/login?error=oauth', { replace: true }));
  }, [acceptTokens, navigate]);

  return <FullScreenLoader />;
}
