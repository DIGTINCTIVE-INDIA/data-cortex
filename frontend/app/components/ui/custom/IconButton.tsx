// import { useAuthStore } from "@/contexts/AuthContext";
// import { Button } from "../button";

// // <Icon onlyAdmin ><PendilCIon></PendilCIon></Icon>

// type Props = React.ComponentProps<typeof Button> & {
//   onlyAdmin?: boolean;
// };

// type ButtonClick = NonNullable<Props["onClick"]>;

// const IconButton = ({ onlyAdmin, disabled, onClick, ...props }: Props) => {

//   const role = useAuthStore(state => state.auth.session?.role);
//   const isDisabled = onlyAdmin && role !== "admin";

//   const handleClick: ButtonClick = e => {
//     if (isDisabled) return;
//     onClick?.(e);
//   };

//    return (
//     <Button
//       {...props}
//       onClick={handleClick}
//       disabled={disabled || isDisabled}
//     />
//   );
// };
// export default IconButton;
