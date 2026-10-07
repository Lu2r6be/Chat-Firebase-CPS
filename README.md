# Chat Firebase

Trabalho de React Native com Expo e TypeScript. O projeto foi iniciado a partir da estrutura usada nas aulas.

## Integrante

- Luiz Henrique Dos Reis Grabe — RM 556001

## Estado atual

- Base Expo SDK 57 e TypeScript criada.
- Cadastro, login, recuperação da sessão e logout com Firebase Authentication.
- Perfis completos em `users/{uid}`, acessíveis apenas pelo próprio usuário.
- Lista de usuários com nome e foto em `publicProfiles/{uid}`, visível a usuários autenticados.
- Criação e lista de conversas individuais em `directConversations/{id}`; o ID usa os dois `uid` em ordem para evitar duplicatas.
- Mensagens individuais salvas e sincronizadas em tempo real no Realtime Database.
- Criação de grupos no Firestore com seleção de integrantes, limite e política de notificações.
- Mensagens de grupo persistidas e atualizadas em tempo real no Realtime Database.
- O proprietário pode adicionar/remover integrantes, alterar o limite e editar a política de notificações.
- Fotos de perfil e grupo: seleção no aparelho e upload assinado ao Cloudinary pela API.
- Perfis próprios editáveis e perfis de outros usuários protegidos pela API, liberados apenas para integrantes da mesma conversa ou grupo.
- Tokens Expo Push guardados em `users/{uid}/devices`, com regras para que cada usuário só gerencie os próprios dispositivos.
- API Express com validação de token Firebase, assinatura de upload, acesso controlado a perfis e cálculo de destinatários no servidor.
- Envio de notificações pela API usando políticas do grupo, deduplicação por mensagem e desativação de tokens inválidos.
- Ao tocar numa notificação, o app abre a conversa correspondente.
- Regras do Realtime Database em `database.rules.json`; regras do Firestore em `firestore.rules`.
- `firebaseConfig.json` contém a configuração pública do SDK cliente.

## Serviços utilizados

- Firebase Authentication autentica com e-mail e senha e mantém a sessão do usuário.
- Cloud Firestore guarda perfis, conversas individuais, grupos, políticas e tokens dos dispositivos.
- Realtime Database guarda as mensagens e sincroniza as conversas abertas.
- Expo Push Service entrega as notificações usando tokens Expo; o app usa `expo-notifications` para registrar o dispositivo e abrir a conversa ao tocar no push.
- Cloudinary armazena as fotos. A API assina os uploads e só a URL resultante é salva no Firestore.

## Instalação e execução

Requer Node.js 20 ou superior e npm.

1. Na raiz, execute `npm install`.
2. Execute `npm start` e abra o app pelo Expo.

O aplicativo usa `https://chat-firebase-cps.vercel.app` por padrão. Para usar outra API, copie `.env.example` para `.env` e altere `EXPO_PUBLIC_API_URL`.

O `firebaseConfig.json` já contém a configuração pública do projeto Firebase. Não coloque credenciais administrativas nesse arquivo.

Para executar a API localmente, entre em `server`, execute `npm install`, copie `server/.env.example` para `server/.env`, preencha as variáveis apenas para uso local e execute `npm run dev`. A API local serve para desenvolvimento; a correção exige o endereço público online.

## Configuração para testar fotos e push

As versões atuais de `firestore.rules` e `database.rules.json` foram publicadas no Firebase. O app Android `com.lu2r6be.chatfirebasecps` foi registrado no Firebase e usa `google-services.json`. O projeto EAS `@lu2r6be/chat-firebase` já está vinculado.

O APK de desenvolvimento foi enviado ao EAS. Ainda é necessário cadastrar a credencial FCM para push, instalar o APK em um Android físico, permitir notificações e testar cadastro com foto, troca de foto, mensagens, políticas e abertura da conversa pelo push.

O Vercel atende a API sem um processo local, mas o plano gratuito tem limites mensais. As credenciais administrativas e do Cloudinary devem ficar somente nas variáveis secretas da hospedagem.

O `.env.example` da raiz mostra como substituir a URL da API; `server/.env.example` lista as variáveis da API com marcadores seguros. Nenhum dos arquivos contém credenciais privadas.

## Build e notificações push

O Expo Go serve para testar o chat, mas notificações push remotas exigem um development build. O app Android, o `google-services.json` e `expo.android.googleServicesFile` já estão configurados. O arquivo JSON contém a configuração pública do app Android; não inclua uma chave de conta de serviço nele.

O projeto está vinculado ao EAS com o ID `e2315009-7f40-494e-b621-c3a6220408fa`. Para concluir o push Android, cadastre a credencial FCM V1 nas credenciais do EAS e instale o APK de desenvolvimento gerado. A chave FCM deve ficar no EAS, fora do GitHub. Para push no iOS, também é necessária uma chave APNs; a geração dessa credencial exige uma conta paga do Apple Developer.

O projeto pode ser compilado para iOS com o identificador `com.lu2r6be.chatfirebasecps`; as credenciais de push do iOS ainda não foram configuradas.

## API

A API é Node.js com Express e está publicada no Vercel com a pasta `server` como Root Directory. URL de produção: https://chat-firebase-cps.vercel.app. O endpoint https://chat-firebase-cps.vercel.app/health respondeu com `{"status":"ok"}`.

Para publicar outra instância, conecte o repositório ao Vercel, escolha `server` como Root Directory e cadastre as variáveis abaixo.

- `FIREBASE_PROJECT_ID`: ID do projeto Firebase.
- `FIREBASE_DATABASE_URL`: URL do Realtime Database.
- `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`: conta de serviço do Firebase, mantida apenas como variáveis secretas.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET`: credenciais da conta Cloudinary; a chave secreta fica somente na hospedagem.

- `GET /health` confirma que a API está online.
- `POST /uploads/signature` gera a assinatura autenticada para enviar foto ao Cloudinary.
- `GET /profiles/:uid` devolve os dados do perfil quando existe conversa ou grupo compartilhado.
- `POST /groups/:groupId/sync` valida a participação e sincroniza os integrantes no Realtime Database.
- `POST /groups/:groupId/members` adiciona ou remove integrantes; a API valida o proprietário e o limite em uma transação do Firestore.
- `POST /notifications/messages` valida a mensagem e calcula os destinatários no servidor antes de solicitar o push.

Todas as rotas, exceto `/health`, exigem `Authorization: Bearer <Firebase ID token>`. O endpoint `/health` confirma a disponibilidade da API; ele não substitui um teste autenticado de fotos, grupos e notificações.

As chaves do Firebase são criadas em Configurações do projeto > Contas de serviço. Os dados do Cloudinary são encontrados nas configurações da conta. Não envie essas chaves por mensagem nem as adicione ao GitHub.

## Regras de segurança

As regras em `firestore.rules` limitam perfis privados ao próprio usuário, conversas aos participantes e configurações de grupo ao proprietário. As regras em `database.rules.json` limitam leitura e envio de mensagens aos participantes, validam remetente e estrutura da mensagem e impedem que o app altere diretamente o espelho de integrantes do grupo. A API sincroniza esse espelho usando a lista validada no Firestore.

O Realtime Database guarda os participantes da conversa individual em `directMembers/{conversationId}` para aplicar suas regras. Antes de criar esse vínculo, o aplicativo confirma a conversa no Firestore. Como as regras do Realtime Database não consultam o Firestore, a API valida a participação do grupo no Firestore antes de sincronizar o espelho `groupMembers/{groupId}`. As regras do Realtime Database impedem que o aplicativo altere esse espelho diretamente. Em mensagens direcionadas de grupo, `mentionedUserIds` é derivado do campo `target` na leitura; listas vazias não são armazenadas.

O limite de integrantes é verificado pela interface e por uma transação no servidor, que lê e atualiza a lista no Firestore antes de sincronizá-la ao Realtime Database. Isso impede que duas adições simultâneas ultrapassem o limite.

## Políticas de notificações

- `all_group_messages`: envia ao grupo, exceto ao remetente.
- `mentioned_members`: envia somente ao integrante selecionado como destinatário.
- `direct_messages_only`: não envia push para mensagens do grupo; conversas individuais continuam notificando.
- `disabled`: não envia push para mensagens do grupo.

O app não envia push com credenciais administrativas. A API usa tokens Expo guardados no Firestore e o payload inclui o ID e o tipo da conversa.

## Fotos

As fotos de perfil e de grupo ficam no Cloudinary (`cloud_name`: `hwgpx1dv`). O aplicativo pede uma assinatura à API autenticada e envia a imagem; somente a URL final fica no Firestore. A chave secreta do Cloudinary fica apenas nas variáveis secretas da API hospedada.

O Firebase Storage exige o plano Blaze neste projeto; nenhuma cobrança foi ativada. As credenciais da API ficam nas variáveis secretas do Vercel.

## Estrutura do projeto

- `App.tsx` reúne a navegação e a abertura de conversas por notificação.
- `src/screens` contém as telas; `src/services` concentra o acesso ao Firebase e à API.
- `server/src/app.js` implementa a API; `firestore.rules` e `database.rules.json` definem as regras dos bancos.

## Evidências pendentes

Após os testes no dispositivo, adicionar capturas das telas principais e uma evidência de push recebido.
