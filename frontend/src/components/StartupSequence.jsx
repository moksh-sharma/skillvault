import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './StartupSequence.css';

const StartupSequence = ({ onComplete }) => {
    const [stage, setStage] = useState(0);

    const stages = [
        "Initializing Portal...",
        "Loading Components...",
        "Preparing System...",
        "Almost Ready...",
        "Welcome to SkillVault"
    ];

    useEffect(() => {
        const timer = setInterval(() => {
            setStage((prev) => (prev < stages.length - 1 ? prev + 1 : prev));
        }, 1000);

        const completeTimer = setTimeout(() => {
            onComplete();
        }, 5500);

        return () => {
            clearInterval(timer);
            clearTimeout(completeTimer);
        };
    }, [onComplete, stages.length]);

    return (
        <div className="startup-container">
            <div className="transition-background">
                <div className="gradient-orb orb-1"></div>
                <div className="gradient-orb orb-2"></div>
                <div className="gradient-orb orb-3"></div>
            </div>

            <div className="content-wrapper">
                <motion.div
                    className="logo-container"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
                >
                    <div className="logo-circle">
                        <motion.div
                            className="logo-inner"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                        >
                            <motion.span
                                className="logo-text"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.5 }}
                            >
                                TB
                            </motion.span>
                        </motion.div>
                    </div>
                    <motion.div
                        className="outer-ring"
                        animate={{ rotate: -360 }}
                        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                    ></motion.div>
                    <motion.div
                        className="pulse-ring"
                        animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    ></motion.div>
                </motion.div>

                <motion.div
                    className="status-container"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={stage}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.4 }}
                            className="status-text"
                        >
                            {stages[stage]}
                        </motion.div>
                    </AnimatePresence>

                    <div className="progress-bar-container">
                        <motion.div
                            className="progress-bar-fill"
                            initial={{ width: "0%" }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 5, ease: "easeInOut" }}
                        />
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default StartupSequence;
