import { useSearchParams } from "react-router-dom";
import { useIsTV } from "../hooks/useDeviceProfile";
import { SignIn } from "./SignIn";
import { TvSignIn } from "./TvSignIn";

/**
 * Picks the right sign-in screen for the device.
 *
 * A separate component rather than a branch inside SignIn: the device profile
 * can change at runtime (a resize, or the override in Settings), and switching
 * which hooks run inside a single component would break the rules of hooks.
 * ?form=1 forces the email/password form, which is how the TV screen offers a
 * way out for anyone without a phone to hand.
 */
export function SignInGate() {
  const [params] = useSearchParams();
  const isTV = useIsTV();
  return isTV && params.get("form") !== "1" ? <TvSignIn /> : <SignIn />;
}
