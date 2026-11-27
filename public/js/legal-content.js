// Textos legales de FieldFlow (español e inglés). Formato de cada sección: { title, blocks }.
//   bloque texto  → párrafo
//   bloque lista  → viñetas; cada elemento puede ser 'Etiqueta|descripción' (la etiqueta va en negrita)
// Contacto único del servicio: CONTACT. Fecha de la versión vigente: UPDATED.
export const CONTACT = 'fieldflow-ayuda@googlegroups.com';
export const UPDATED = '2026-11-26';

export const LEGAL = {
  privacidad: {
    es: {
      title: 'Política de privacidad',
      lead: 'Explicamos qué datos recopilamos, para qué los usamos y cómo puedes controlarlos.',
      sections: [
        { title: 'Quiénes somos y alcance', blocks: [
          'Esta Política de privacidad explica cómo FieldFlow («nosotros») recopila, usa, almacena y protege los datos personales de las personas que usan la aplicación web y móvil (PWA) de FieldFlow y su asistente de mensajería (el «Servicio»). Hace parte de nuestros Términos de servicio.',
          'Somos responsables del tratamiento de los datos de tu cuenta. Sobre los datos de los clientes de tu negocio, tu negocio decide qué se trata y para qué; nosotros los tratamos por cuenta de tu negocio, como encargados, solo para prestarte el Servicio (ver sección 10).',
          'Esta política se rige por la Ley 1581 de 2012, el Decreto 1074 de 2015 (que compila el Decreto 1377 de 2013) y el artículo 15 de la Constitución Política de Colombia (derecho de habeas data).',
        ] },
        { title: 'Datos que recopilamos', blocks: [
          ['Datos de la cuenta|nombre de tu empresa, tu nombre, correo electrónico, teléfono, tipo de negocio, ubicación y los usos que elijas al registrarte. La contraseña se guarda cifrada (hash con scrypt): nunca la guardamos ni la vemos en texto plano.',
            'Inicio de sesión con Google|si eliges esta opción recibimos de Google únicamente tu nombre, correo y un identificador de cuenta (permisos «openid», «email» y «profile»). No accedemos a tus contactos, correos, archivos ni a otros datos de tu cuenta de Google.',
            'Datos del negocio|servicios, parcelas y recursos, citas y su estado, clientes (nombre y teléfono) y las conversaciones con el asistente (mensajes de texto y, si usas la voz, el texto reconocido).',
            'Datos técnicos mínimos|una cookie de sesión para mantenerte dentro y registros de seguridad: límites de intentos, errores y una huella cifrada (hash) de la dirección IP para frenar abusos.'],
          'No recopilamos números de tarjeta ni de cuentas bancarias: FieldFlow no procesa pagos. No usamos cookies publicitarias ni herramientas de analítica de terceros.',
          'El reconocimiento de voz lo realiza tu navegador o sistema operativo (su proveedor puede procesar el audio según sus propias políticas); FieldFlow recibe únicamente el texto resultante.',
        ] },
        { title: 'Autorización y base legal', blocks: [
          'Tratamos tus datos con tu autorización previa, expresa e informada (art. 9, Ley 1581 de 2012), que nos das al crear tu cuenta o ingresar con Google y aceptar estos documentos. Puedes revocarla en cualquier momento, salvo cuando exista un deber legal o contractual de conservar los datos.',
          'No solicitamos datos sensibles (salud, origen étnico, orientación política, entre otros). Te pedimos no registrarlos en el Servicio.',
        ] },
        { title: 'Para qué usamos tus datos', blocks: [
          ['Crear tu cuenta, verificar tu correo y autenticarte.',
            'Prestar el Servicio: agendar citas, coordinar recursos y parcelas, atender a los clientes de tu negocio por chat y mostrarte tu panel.',
            'Enviarte mensajes del servicio, como el código de verificación y el de recuperación de contraseña.',
            'Responder consultas, dar soporte y proteger el Servicio contra abusos y accesos no autorizados.',
            'Cumplir obligaciones legales.'],
          'No vendemos ni alquilamos tus datos y no los usamos para publicidad.',
        ] },
        { title: 'Con quién compartimos los datos', blocks: [
          'Solo con proveedores que nos ayudan a operar el Servicio y en la medida necesaria:',
          ['Vercel|alojamiento de la aplicación.',
            'Neon|base de datos donde se almacena la información.',
            'Brevo|envío de los correos del servicio (verificación y recuperación).',
            'Google|inicio de sesión, cuando eliges «Continuar con Google».',
            'Meta (WhatsApp Business)|recepción y envío de mensajes cuando tu negocio usa el canal de WhatsApp.',
            'Proveedor de modelos de lenguaje (por ejemplo, Groq)|si el asistente con inteligencia artificial está activo, el texto de la conversación se envía para generar las respuestas. Sin esa opción, el asistente funciona con un flujo guiado y no se envía nada.'],
          'Algunos de estos proveedores pueden procesar datos en servidores fuera de Colombia. En esos casos los datos se transmiten a encargados que los tratan por nuestra cuenta y solo para operar el Servicio. También podemos entregar información si una autoridad competente lo exige conforme a la ley.',
        ] },
        { title: 'Cookies y almacenamiento en tu dispositivo', blocks: [
          'Usamos una cookie de sesión estrictamente necesaria (HttpOnly, SameSite=Lax y Secure) para mantenerte dentro, y una cookie temporal de 10 minutos durante el ingreso con Google para protegerlo contra suplantación. Cerrar sesión elimina la cookie de sesión.',
          'La aplicación también guarda en tu dispositivo tu idioma, tu tema y preferencias de pantalla, y los archivos de la aplicación para que cargue rápido (service worker). Estos datos no se usan para seguirte ni para publicidad.',
        ] },
        { title: 'Conservación', blocks: [
          'Conservamos tus datos mientras tu cuenta esté activa. Si pides la supresión de tu cuenta, eliminamos tus datos personales y los de tu negocio, salvo lo que debamos conservar por obligación legal o para resolver disputas.',
          'Los códigos de verificación y de recuperación vencen a los 15 minutos, se guardan cifrados y tienen un número limitado de intentos.',
        ] },
        { title: 'Seguridad', blocks: [
          ['Conexiones cifradas (HTTPS).',
            'Contraseñas y códigos guardados con hash, nunca en texto plano.',
            'Cookies de sesión HttpOnly, no accesibles desde scripts.',
            'Límites de intentos y de envíos para frenar ataques de fuerza bruta.',
            'Aislamiento por negocio: cada negocio ve únicamente sus propios datos.',
            'Acceso restringido a la base de datos y webhooks firmados.'],
          'Ningún sistema es infalible. Si detectamos un incidente que afecte tus datos, te lo notificaremos y lo reportaremos a la Superintendencia de Industria y Comercio cuando la ley lo exija.',
        ] },
        { title: 'Tus derechos', blocks: [
          'Como titular, según el artículo 8 de la Ley 1581 de 2012, tienes derecho a:',
          ['Conocer, actualizar y rectificar tus datos personales.',
            'Solicitar prueba de la autorización que nos diste.',
            'Ser informado sobre el uso que damos a tus datos.',
            'Presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la ley.',
            'Revocar la autorización y/o solicitar la supresión de tus datos cuando no se respeten los principios, derechos y garantías legales.',
            'Acceder de forma gratuita a tus datos personales.'],
          'Para ejercerlos, escribe a {contact} indicando tu nombre, el correo de tu cuenta y lo que solicitas. Respondemos las consultas en máximo 10 días hábiles y los reclamos en máximo 15 días hábiles desde su recibo; si necesitamos más tiempo, te avisamos el motivo y la nueva fecha dentro de los plazos de ley (arts. 14 y 15, Ley 1581 de 2012).',
        ] },
        { title: 'Datos de los clientes de tu negocio', blocks: [
          'Si registras clientes (nombre, teléfono, citas, conversaciones) o ellos te escriben por el asistente, tu negocio es el responsable de esos datos y debe contar con su autorización para tratarlos y contactarlos. FieldFlow actúa como encargado: los trata solo para prestarte el Servicio y siguiendo tus instrucciones.',
          'Si un cliente tuyo quiere ejercer sus derechos, debe dirigirse a tu negocio; nosotros te ayudaremos con lo necesario.',
        ] },
        { title: 'Menores de edad', blocks: [
          'FieldFlow está dirigido a personas mayores de 18 años que gestionan un negocio. No tratamos a sabiendas datos de menores de edad; si crees que un menor nos entregó datos, escríbenos y los eliminaremos.',
        ] },
        { title: 'Cambios a esta política', blocks: [
          'Podemos actualizar esta política. Publicaremos la versión vigente en esta página con su fecha de actualización y, si el cambio es importante, te avisaremos en la aplicación o por correo.',
        ] },
        { title: 'Contacto', blocks: [
          'Para cualquier consulta sobre privacidad o tus datos, escríbenos a {contact}.',
        ] },
      ],
    },
    en: {
      title: 'Privacy policy',
      lead: 'We explain what data we collect, what we use it for and how you can control it.',
      sections: [
        { title: 'Who we are and scope', blocks: [
          'This Privacy Policy explains how FieldFlow (“we”) collects, uses, stores and protects the personal data of people who use the FieldFlow web and mobile app (PWA) and its messaging assistant (the “Service”). It is part of our Terms of Service.',
          'We are the controller of your account data. For the data of your business’s customers, your business decides what is processed and why; we process it on your business’s behalf, as a processor, only to provide the Service (see section 10).',
          'This policy is governed by Colombian Law 1581 of 2012, Decree 1074 of 2015 (which compiles Decree 1377 of 2013) and Article 15 of the Colombian Constitution (habeas data).',
        ] },
        { title: 'Data we collect', blocks: [
          ['Account data|your company name, your name, email address, phone number, business type, location and the uses you choose when signing up. Your password is stored hashed (scrypt): we never store or see it in plain text.',
            'Sign in with Google|if you choose this option we receive from Google only your name, email and an account identifier (“openid”, “email” and “profile” scopes). We do not access your contacts, emails, files or any other data in your Google account.',
            'Business data|services, plots and resources, appointments and their status, customers (name and phone) and conversations with the assistant (text messages and, if you use voice, the recognized text).',
            'Minimal technical data|a session cookie to keep you signed in and security logs: attempt limits, errors and a hashed fingerprint of the IP address to stop abuse.'],
          'We do not collect card or bank account numbers: FieldFlow does not process payments. We do not use advertising cookies or third-party analytics tools.',
          'Speech recognition is performed by your browser or operating system (its provider may process the audio under its own policies); FieldFlow receives only the resulting text.',
        ] },
        { title: 'Authorization and legal basis', blocks: [
          'We process your data with your prior, express and informed authorization (art. 9, Law 1581 of 2012), which you give when you create your account or sign in with Google and accept these documents. You can withdraw it at any time, except where there is a legal or contractual duty to keep the data.',
          'We do not request sensitive data (health, ethnic origin, political orientation, among others). Please do not enter it in the Service.',
        ] },
        { title: 'How we use your data', blocks: [
          ['Create your account, verify your email and authenticate you.',
            'Provide the Service: schedule appointments, coordinate resources and plots, serve your business’s customers by chat and show you your dashboard.',
            'Send you service messages, such as the verification code and the password recovery code.',
            'Answer requests, give support and protect the Service against abuse and unauthorized access.',
            'Comply with legal obligations.'],
          'We do not sell or rent your data and we do not use it for advertising.',
        ] },
        { title: 'Who we share data with', blocks: [
          'Only with providers that help us operate the Service, and only as far as necessary:',
          ['Vercel|application hosting.',
            'Neon|the database where information is stored.',
            'Brevo|delivery of service emails (verification and recovery).',
            'Google|sign-in, when you choose “Continue with Google”.',
            'Meta (WhatsApp Business)|receiving and sending messages when your business uses the WhatsApp channel.',
            'Language model provider (for example, Groq)|if the AI assistant is active, the conversation text is sent to generate replies. Without that option the assistant runs a guided flow and nothing is sent.'],
          'Some of these providers may process data on servers outside Colombia. In those cases data is transmitted to processors that handle it on our behalf and only to operate the Service. We may also disclose information if a competent authority requires it by law.',
        ] },
        { title: 'Cookies and on-device storage', blocks: [
          'We use a strictly necessary session cookie (HttpOnly, SameSite=Lax and Secure) to keep you signed in, and a temporary 10-minute cookie while signing in with Google to protect it against impersonation. Logging out removes the session cookie.',
          'The app also stores on your device your language, theme and display preferences, and the app files so it loads quickly (service worker). This data is not used to track you or for advertising.',
        ] },
        { title: 'Data retention', blocks: [
          'We keep your data while your account is active. If you request deletion of your account, we delete your personal and business data, except what we must keep for legal obligations or to resolve disputes.',
          'Verification and recovery codes expire after 15 minutes, are stored hashed and have a limited number of attempts.',
        ] },
        { title: 'Security', blocks: [
          ['Encrypted connections (HTTPS).',
            'Passwords and codes stored hashed, never in plain text.',
            'HttpOnly session cookies, not accessible from scripts.',
            'Attempt and send limits to stop brute-force attacks.',
            'Per-business isolation: each business sees only its own data.',
            'Restricted database access and signed webhooks.'],
          'No system is completely infallible. If we detect an incident affecting your data, we will notify you and report it to the Superintendence of Industry and Commerce when the law requires it.',
        ] },
        { title: 'Your rights', blocks: [
          'As a data subject, under Article 8 of Law 1581 of 2012, you have the right to:',
          ['Know, update and correct your personal data.',
            'Request proof of the authorization you gave us.',
            'Be informed about how we use your data.',
            'File complaints with the Superintendence of Industry and Commerce (SIC) for violations of the law.',
            'Withdraw your authorization and/or request deletion of your data when legal principles, rights and guarantees are not respected.',
            'Access your personal data free of charge.'],
          'To exercise them, write to {contact} with your name, your account email and what you are asking for. We answer inquiries within 10 business days and complaints within 15 business days of receipt; if we need more time, we will tell you why and the new date, within the legal deadlines (arts. 14 and 15, Law 1581 of 2012).',
        ] },
        { title: 'Your business’s customers’ data', blocks: [
          'If you record customers (name, phone, appointments, conversations) or they write to you through the assistant, your business is responsible for that data and must have their authorization to process it and contact them. FieldFlow acts as a processor: it handles the data only to provide the Service and following your instructions.',
          'If one of your customers wants to exercise their rights, they should contact your business; we will help you with whatever is needed.',
        ] },
        { title: 'Minors', blocks: [
          'FieldFlow is intended for adults over 18 who run a business. We do not knowingly process data of minors; if you believe a minor has given us data, write to us and we will delete it.',
        ] },
        { title: 'Changes to this policy', blocks: [
          'We may update this policy. We will post the current version on this page with its update date and, if the change is material, notify you in the app or by email.',
        ] },
        { title: 'Contact', blocks: [
          'For any question about privacy or your data, write to us at {contact}.',
        ] },
      ],
    },
  },

  terminos: {
    es: {
      title: 'Términos de servicio',
      lead: 'Las reglas para usar FieldFlow: qué ofrecemos, qué esperamos de ti y cómo nos cuidamos mutuamente.',
      sections: [
        { title: 'Aceptación de estos términos', blocks: [
          'Estos Términos de servicio (los «Términos») rigen el acceso y uso de FieldFlow, la aplicación web y móvil (PWA) para agendar, coordinar y mover la operación de negocios del sector agro (el «Servicio»).',
          'Al crear una cuenta, ingresar o usar el Servicio aceptas estos Términos; esa aceptación por medios electrónicos tiene plena validez (Ley 527 de 1999). Si no estás de acuerdo, no uses el Servicio. Si usas FieldFlow en nombre de un negocio, confirmas que tienes autoridad para obligarlo.',
        ] },
        { title: 'Descripción del Servicio', blocks: [
          'FieldFlow permite a los negocios del agro agendar citas y visitas, coordinar recursos (como las parcelas), atender a sus clientes por chat y WhatsApp, y ver su día en un panel.',
          'FieldFlow es una herramienta de gestión. No reemplaza la asesoría agronómica, legal, contable ni de otro tipo, y las decisiones de tu operación siguen siendo tuyas.',
        ] },
        { title: 'Cuentas y seguridad', blocks: [
          'Debes ser mayor de edad (o tener capacidad legal para contratar) para crear una cuenta, y la información que entregues debe ser veraz y estar actualizada.',
          'Eres responsable de mantener tu contraseña en reserva y de todo lo que ocurra con tu cuenta. El titular del negocio responde por las personas a quienes dé acceso.',
          'Avísanos de inmediato si sospechas un uso no autorizado escribiendo a {contact}.',
        ] },
        { title: 'Uso aceptable', blocks: [
          'Te comprometes a usar el Servicio de forma lícita. No puedes:',
          ['usarlo para actividades ilegales o fraudulentas, ni para vulnerar derechos de otros;',
            'intentar acceder sin autorización a cuentas, sistemas o datos de otros negocios;',
            'interferir con el Servicio, sobrecargarlo o intentar eludir sus medidas de seguridad;',
            'copiarlo, descompilarlo o revenderlo, salvo donde la ley lo permita o lo autoricemos por escrito;',
            'cargar contenido malicioso, como virus o código dañino;',
            'enviar mensajes no solicitados (spam) ni contactar a personas sin su autorización, ni incumplir las políticas de WhatsApp y Meta.'],
        ] },
        { title: 'Tus datos y contenido', blocks: [
          'Los datos de tu negocio (citas, recursos, clientes, conversaciones, etc.) son tuyos. Nos otorgas una licencia limitada, no exclusiva y revocable para almacenarlos, procesarlos y mostrarlos únicamente para prestarte el Servicio.',
          'Puedes pedirnos una copia de tus datos escribiendo a {contact}.',
        ] },
        { title: 'Clientes de tu negocio y mensajería', blocks: [
          'Eres responsable de contar con las autorizaciones necesarias para registrar y tratar los datos personales de tus clientes y para contactarlos por los canales del Servicio, conforme a la ley.',
          'Los mensajes que el asistente envía a tus clientes salen en nombre de tu negocio. Puedes tomar el control de cualquier conversación desde la bandeja.',
        ] },
        { title: 'Asistente automatizado', blocks: [
          'El asistente puede funcionar con un flujo guiado o con inteligencia artificial. Las respuestas generadas automáticamente pueden contener errores o malinterpretar un mensaje.',
          'Debes revisar las citas confirmadas y supervisar la atención a tus clientes. El asistente no ofrece asesoría profesional de ningún tipo.',
        ] },
        { title: 'Privacidad y protección de datos', blocks: [
          'Tratamos los datos personales conforme a la Ley 1581 de 2012 y demás normas aplicables. Usamos tu correo y tu nombre para crear tu cuenta, autenticarte, enviarte mensajes del servicio (como la recuperación de contraseña) y darte soporte.',
          'No vendemos tus datos. Tienes derecho a conocer, actualizar, rectificar y suprimir tu información y a revocar tu autorización. Los detalles están en nuestra Política de privacidad.',
        ] },
        { title: 'Servicios de terceros', blocks: [
          'Para operar nos apoyamos en terceros, como alojamiento y base de datos (Vercel y Neon), envío de correo (Brevo), ingreso con Google, WhatsApp (Meta) y, si está activo, un proveedor de modelos de lenguaje. Su uso puede estar sujeto a sus propios términos y políticas, y no controlamos su disponibilidad ni su contenido.',
        ] },
        { title: 'Planes, precios y pagos', blocks: [
          'FieldFlow puede ofrecerse de forma gratuita o mediante planes de pago. Si introducimos tarifas, te lo diremos con anticipación y no cobraremos nada sin tu consentimiento expreso.',
          'FieldFlow no procesa pagos entre tu negocio y tus clientes ni custodia dinero.',
        ] },
        { title: 'Propiedad intelectual', blocks: [
          'El Servicio, su diseño, marca, código y contenido (distinto de tus datos) pertenecen a FieldFlow o a sus licenciantes y están protegidos por las normas de propiedad intelectual. Estos Términos no te transfieren derecho alguno distinto del de usar el Servicio según lo aquí previsto.',
          'Si nos envías comentarios o sugerencias, podremos usarlos para mejorar el Servicio sin obligación alguna contigo.',
        ] },
        { title: 'Disponibilidad y cambios del Servicio', blocks: [
          'Trabajamos para mantener el Servicio disponible, pero no garantizamos que funcione sin interrupciones ni errores. Podemos hacer mantenimientos, actualizaciones y cambios, o retirar funciones, y procuraremos avisarte con anticipación cuando sean importantes.',
          'El Servicio incluye controles para evitar cruces de horarios, pero no garantizamos que esté libre de fallos: verifica tu agenda en los compromisos críticos de tu operación (cosechas, fumigaciones, transporte, entregas).',
        ] },
        { title: 'Exoneración y límite de responsabilidad', blocks: [
          'El Servicio se ofrece «tal cual» y «según disponibilidad». En la máxima medida que permita la ley, no garantizamos que sea apto para un fin particular ni que esté libre de errores.',
          'En lo permitido por la ley, FieldFlow no responde por daños indirectos, lucro cesante, ni por pérdidas de cosecha, insumos, datos o ingresos derivadas del uso o de la imposibilidad de usar el Servicio, incluidas citas no atendidas o mal programadas. Nada de lo aquí dicho limita los derechos irrenunciables que la ley te otorga, incluido el Estatuto del Consumidor (Ley 1480 de 2011) cuando aplique.',
        ] },
        { title: 'Suspensión y terminación', blocks: [
          'Puedes dejar de usar el Servicio cuando quieras y pedir la eliminación de tu cuenta escribiendo a {contact}.',
          'Podemos suspender o cerrar tu cuenta si incumples estos Términos, si hay riesgo para la seguridad del Servicio o de otros usuarios, o si la ley lo exige. Cuando sea razonable, te avisaremos antes y te daremos oportunidad de pedir una copia de tus datos.',
        ] },
        { title: 'Cambios a estos Términos', blocks: [
          'Podemos actualizar estos Términos. Publicaremos la versión vigente en esta página con su fecha de actualización y, si el cambio es importante, te avisaremos en la aplicación o por correo. Si sigues usando el Servicio después de que el cambio entre en vigor, lo aceptas.',
        ] },
        { title: 'Ley aplicable y jurisdicción', blocks: [
          'Estos Términos se rigen por las leyes de la República de Colombia. Cualquier controversia se someterá a los jueces competentes de Bogotá D. C., sin perjuicio de los derechos que la ley te otorga como consumidor.',
        ] },
        { title: 'Contacto', blocks: [
          '¿Preguntas sobre estos Términos? Escríbenos a {contact}.',
        ] },
      ],
    },
    en: {
      title: 'Terms of service',
      lead: 'The rules for using FieldFlow: what we offer, what we expect from you and how we look after each other.',
      sections: [
        { title: 'Acceptance of these terms', blocks: [
          'These Terms of Service (the “Terms”) govern access to and use of FieldFlow, the web and mobile app (PWA) to schedule, coordinate and move the operations of agriculture businesses (the “Service”).',
          'By creating an account, logging in or using the Service you agree to these Terms; such electronic acceptance is fully valid (Colombian Law 527 of 1999). If you do not agree, do not use the Service. If you use FieldFlow on behalf of a business, you confirm that you have authority to bind it.',
        ] },
        { title: 'Description of the Service', blocks: [
          'FieldFlow lets agriculture businesses schedule appointments and visits, coordinate resources (such as plots), serve their customers over chat and WhatsApp, and see their day on a dashboard.',
          'FieldFlow is a management tool. It does not replace agronomic, legal, accounting or any other professional advice, and decisions about your operation remain yours.',
        ] },
        { title: 'Accounts and security', blocks: [
          'You must be of legal age (or otherwise have legal capacity to contract) to create an account, and the information you provide must be accurate and kept up to date.',
          'You are responsible for keeping your password confidential and for everything that happens under your account. The business owner is responsible for the people they give access to.',
          'Tell us immediately if you suspect unauthorized use by writing to {contact}.',
        ] },
        { title: 'Acceptable use', blocks: [
          'You agree to use the Service lawfully. You may not:',
          ['use it for illegal or fraudulent activity, or to infringe the rights of others;',
            'attempt to gain unauthorized access to accounts, systems or data of other businesses;',
            'interfere with the Service, overload it or try to bypass its security measures;',
            'copy, reverse engineer or resell it, except where the law allows or we authorize in writing;',
            'upload malicious content such as viruses or harmful code;',
            'send unsolicited messages (spam), contact people without their authorization, or breach the WhatsApp and Meta policies.'],
        ] },
        { title: 'Your data and content', blocks: [
          'The data about your business (appointments, resources, customers, conversations, etc.) is yours. You grant us a limited, non-exclusive, revocable license to store, process and display it solely to provide the Service to you.',
          'You can ask us for a copy of your data by writing to {contact}.',
        ] },
        { title: 'Your business’s customers and messaging', blocks: [
          'You are responsible for having the necessary authorizations to record and process your customers’ personal data and to contact them through the Service’s channels, in accordance with the law.',
          'Messages the assistant sends to your customers go out in your business’s name. You can take over any conversation from the inbox.',
        ] },
        { title: 'Automated assistant', blocks: [
          'The assistant may run a guided flow or use artificial intelligence. Automatically generated replies may contain errors or misread a message.',
          'You must review confirmed appointments and supervise how your customers are served. The assistant does not provide professional advice of any kind.',
        ] },
        { title: 'Privacy and data protection', blocks: [
          'We process personal data in accordance with Colombian Law 1581 of 2012 and other applicable rules. We use your email and name to create your account, authenticate you, send you service messages (such as password recovery) and give you support.',
          'We do not sell your data. You have the right to access, update, correct and delete your information and to withdraw your authorization. Details are in our Privacy Policy.',
        ] },
        { title: 'Third-party services', blocks: [
          'To operate we rely on third parties, such as hosting and database (Vercel and Neon), email delivery (Brevo), Google sign-in, WhatsApp (Meta) and, if active, a language model provider. Their use may be subject to their own terms and policies, and we do not control their availability or content.',
        ] },
        { title: 'Plans, pricing and payments', blocks: [
          'FieldFlow may be offered free of charge or through paid plans. If we introduce fees we will tell you in advance and will not charge you anything without your express consent.',
          'FieldFlow does not process payments between your business and your customers and does not hold funds.',
        ] },
        { title: 'Intellectual property', blocks: [
          'The Service, its design, brand, code and content (other than your data) belong to FieldFlow or its licensors and are protected by intellectual property laws. These Terms do not transfer to you any right other than to use the Service as set out here.',
          'If you send us feedback or suggestions, we may use them to improve the Service without any obligation to you.',
        ] },
        { title: 'Availability and changes to the Service', blocks: [
          'We work to keep the Service available, but we do not guarantee it will run without interruption or errors. We may perform maintenance, updates and changes, or remove features, and will try to give you advance notice for significant changes.',
          'The Service includes controls to avoid schedule clashes, but we do not guarantee it is free of faults: check your calendar for the critical commitments of your operation (harvests, spraying, transport, deliveries).',
        ] },
        { title: 'Disclaimer and limitation of liability', blocks: [
          'The Service is provided “as is” and “as available”. To the maximum extent permitted by law, we make no warranty that it is fit for a particular purpose or error-free.',
          'To the extent permitted by law, FieldFlow will not be liable for indirect damages, lost profits, or loss of crops, inputs, data or revenue arising from the use of, or inability to use, the Service, including missed or mis-scheduled appointments. Nothing here limits non-waivable rights granted to you by law, including the Colombian Consumer Statute (Law 1480 of 2011) where applicable.',
        ] },
        { title: 'Suspension and termination', blocks: [
          'You may stop using the Service at any time and request deletion of your account by writing to {contact}.',
          'We may suspend or close your account if you breach these Terms, if there is a risk to the security of the Service or other users, or if the law requires it. Where reasonable, we will notify you first and give you a chance to request a copy of your data.',
        ] },
        { title: 'Changes to these Terms', blocks: [
          'We may update these Terms. We will post the current version on this page with its update date and, if the change is material, notify you in the app or by email. If you keep using the Service after the change takes effect, you accept it.',
        ] },
        { title: 'Governing law and jurisdiction', blocks: [
          'These Terms are governed by the laws of the Republic of Colombia. Any dispute will be submitted to the competent courts of Bogotá D.C., without prejudice to the rights the law grants you as a consumer.',
        ] },
        { title: 'Contact', blocks: [
          'Questions about these Terms? Write to us at {contact}.',
        ] },
      ],
    },
  },
};
