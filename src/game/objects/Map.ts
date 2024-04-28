import { SquareCoordMapper } from "../../mappers/SquareCoordMapper";
import sessionServiceFactory from "../../services/SessionServiceImpl";
import squareServiceFactory from "../../services/SquareServiceImpl";
import { UserPositionMessageDTO } from "../../types/dto/messages/UserPositionMessageDTO";
import { MapSquare } from "./MapSquare";
import { Pirate } from "./Pirate";
import { Player } from "./Player";

export class Map {
    private static mapWidth = 128;
    private static mapSquares: MapSquare[] = [];
    private static squareService = squareServiceFactory();
    private static sessionService = sessionServiceFactory();

    static pirate: Pirate;
    static players: Player[] = [];

    static getMapSquare(x: number, y: number): MapSquare {
        const coords = SquareCoordMapper.toMinimal(x, y);
        const index = Math.floor(coords.x) + Math.floor(coords.y) * Map.mapWidth;
        return Map.mapSquares[index];
    }

    static findPlayerByStandardCoords(x: number, y: number) {
        return this.players.find(player => player.x === x && player.y === y);
    }

    static updatePlayersPositions(data: UserPositionMessageDTO) {
        if (this.sessionService.isCurrentUserSessionId(data.userSessionId)) {
            return;
        }
        const coords = SquareCoordMapper.toStandard(data.x, data.y);
        const player = this.players.find(player => player.checkUserSessionId(data.userSessionId));
        player?.setPosition(coords.x, coords.y);
    }

    static createMap(scene: Phaser.Scene) {
        const img = new Image();
        // TODO :: use this: 
        //      img.src = SERVER_URL + Map.sessionService.sessionMap.source;
        //          But this triggered error "The canvas has been tainted by cross-origin data".
        //          Server should be configured correctly!
        img.src = `assets/maps/map_${Map.mapWidth}.png`;
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            canvas.width = img.width;
            canvas.height = img.height;

            if (context) {
                context.drawImage(img, 0, 0);

                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                const squares = await this.squareService.getUsersPositions();
                squares.forEach((square) => {
                    if (this.sessionService.isCurrentUserSessionId(square.userSessionId)) {
                        return;
                    }
                    const coords = SquareCoordMapper.toStandard(square.square.x, square.square.y);
                    Map.players.push(new Player(scene, coords.x, coords.y, square.userSessionId));
                });

                this.pirate = new Pirate(scene, 0, 0);
                for (let y = 0; y < canvas.height; y++) {
                    for (let x = 0; x < canvas.width; x++) {
                        const index = (y * canvas.width + x) * 4;
                        const red = data[index];
                        const green = data[index + 1];
                        const blue = data[index + 2];

                        const hexColor = (1 << 24) + (red << 16) + (green << 8) + blue;
                        const coords = SquareCoordMapper.toStandard(x, y);
                        const square = new MapSquare(scene, coords.x, coords.y, hexColor, this.pirate);
                        if (square.isPlayerSpawnPoint) {
                            const player = Map.findPlayerByStandardCoords(square.x, square.y);
                            if (!player) {
                                this.pirate.init(square.x, square.y);
                            }
                        }
                        Map.mapSquares.push(square);
                    }
                }
            }
        };
    }

    static async hasLineOfSight(x1: number, y1: number, x2: number, y2: number): Promise<boolean> {
        // Implementation of Bresenham's line algorithm
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = x1 < x2 ? 1 : -1;
        const sy = y1 < y2 ? 1 : -1;
        let err = dx - dy;
    
        for (; x1 !== x2 || y1 !== y2;) {
            const mapSquare = Map.getMapSquare(x1, y1);
            await Map.addMapEvent(mapSquare, x1, y1);
            if (mapSquare?.isObstacle) {
                return false; // There's an obstacle, no line of sight
            }
        
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x1 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y1 += sy;
            }
        }
    
        return true; // No obstacles found, line of sight is clear
    }

    static async addMapEvent(square: MapSquare, x: number, y: number) {
        if (!square) {
            return;
        }
        
        const result = await Map.squareService.saveSquare(square.x, square.y, x === square.x && y === square.y);
        if (result.square.event) {
            square.activateMapEvent(result.square.event);
        }
    }
}

