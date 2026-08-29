import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import DissapearingToast from "../Components/Toast/DissapearingToast";

const ToastContext = createContext();

export function ToastProvider({ children }) {
	const [message, setMessage] = useState("");
	const [messageType, setMessageType] = useState("");
	const [messageTitle, setMessageTitle] = useState("");
	const timeoutId = useRef(null);

	// `messageType` may be a plain string ('success' | 'warning' | 'error') or,
	// when a caller wants a heading other than the capitalized type, an object
	// { type, title }. Kept in that shape so all 28 existing string call sites
	// stay valid without touching them.
	const handleToast = useCallback((message, messageType, duration = 3000, ...params) => {
		const isDetailed = messageType !== null && typeof messageType === "object";

		setMessage(message);
		setMessageType(isDetailed ? messageType.type : messageType);
		setMessageTitle(isDetailed ? messageType.title ?? "" : "");

		if (timeoutId.current) {
			clearTimeout(timeoutId.current);
		}

		timeoutId.current = setTimeout(() => {
			setMessage("");
			timeoutId.current = null;
		}, duration);

		params.forEach((param) => {
			if (typeof param === "function") {
				param();
			}
		});
	}, []);

	// Dismiss early (the toast's own close button) instead of waiting out the
	// duration — clearing the pending timeout too so it can't fire afterward
	// and stomp on a *different* toast triggered in the meantime.
	const dismissToast = useCallback(() => {
		if (timeoutId.current) {
			clearTimeout(timeoutId.current);
			timeoutId.current = null;
		}
		setMessage("");
	}, []);

	return (
		<ToastContext.Provider value={{ message, messageType, handleToast, dismissToast }}>
			<DissapearingToast
				type={messageType}
				title={messageTitle}
				message={message}
				onDismiss={dismissToast}
			/>
			{children}
		</ToastContext.Provider>
	);
}

// Custom hook to use the toast context
export function useToast() {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error("useToast must be used within a ToastProvider");
	}
	return context;
}
