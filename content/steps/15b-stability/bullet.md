**Q:** How are the two stability results proved? Why is $u^P$ stable and $u^Q$ not?

- comparison: sub stays below, super above
- Choose $0<\rho_-<\rho_P<\rho_+<L_1$.
  For each prescribed interface $\rho$, let $V_\rho$ be the bounded
  solution of $-(pV_\rho')'+V_\rho=\mathbf1_{\{x<\rho\}}$
  on $\mathbb R$. Its interface value is $V_\rho(\rho)=b(\rho)$.
  It is a stationary front only when $b(\rho)=a$.
- in the phase planes: the lines meet at $b(\rho)$, the state at the interface; dots are samples
- → shift by $-(b(\rho)-a)$: meeting point onto $u=a$, flux unchanged → $B_\rho$
- $b$ falls: $b(\rho_-)>a$ sub below, $b(\rho_+)<a$ super above (whole decreasing branch)
- As the two interfaces approach $\rho_P$, the shifted comparison profiles
  approach $u^P$ in $W^{1,\infty}(\mathbb R)$.
  Comparison and parabolic estimates give Lyapunov stability
  in the stated class.
- → $u^Q$: join at $\rho_Q$ at $a\pm\sigma$, $\sigma$ small; $J_+>0$ sub above, $J_-<0$ super below
- Initial data at the subsolution above $u^Q$ can be arbitrarily close
  to $u^Q$, yet their solutions leave a fixed neighbourhood of $u^Q$.
  This establishes Lyapunov instability.
- near $\rho_P$ the constant has the sign of $b'(\rho_P)(\rho-\rho_P)$; at $\rho_Q$ the jump has the sign of $b'(\rho_Q)(\beta-a)$, $\beta=a\pm\sigma$
